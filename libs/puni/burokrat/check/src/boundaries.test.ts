import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach, writeRepositoryFile } from '@puni/shared-testing';
import { type CheckHost, dropRemedies, openCheckHost } from './check.test-host';
import type { Rule } from './finding';
import { listAnchors, slugHeading } from './links';
import { forbidFileHeaders, opensWithHeader } from './rules/code.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { resolveLinks } from './rules/links.rule';
import { forbidPlaintextSecrets, forbidStateAddresses } from './rules/secrets.rule';
import { makeRepository } from './repository-pair.test-host';
import {
  configuredLookalikes,
  configuredSamples,
  credentialLookalikes,
  forbiddenAddress,
} from './secrets.test-host';

const scratch = removeScratchDirectoriesAfterEach();

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRepository(scratch);
});

function judge(rule: Rule) {
  return dropRemedies(host.judge(rule, root));
}

describe('secrets.plaintext', () => {
  test.each(configuredSamples)('a bare credential in %s is found', (file, line) => {
    writeRepositoryFile(root, `apps/one/${file}`, `name: one\n${line}\n`);
    expect(judge(forbidPlaintextSecrets)).toEqual([
      {
        rule: 'secrets.plaintext',
        path: `apps/one/${file}`,
        message: 'line 2 holds what looks like a credential assigned in configuration',
      },
    ]);
  });

  test('the same lines in source code are no finding: only configuration is judged so', () => {
    const lines = configuredSamples.map(([, line]) => line);
    writeRepositoryFile(root, 'apps/one/src/notes.ts', `${lines.join('\n')}\n`);
    expect(judge(forbidPlaintextSecrets)).toEqual([]);
  });

  test('placeholders, short values and keys that only contain a word are no finding', () => {
    writeRepositoryFile(root, 'apps/one/config.yml', `${configuredLookalikes.join('\n')}\n`);
    writeRepositoryFile(root, 'apps/one/src/near.ts', `${credentialLookalikes.join('\n')}\n`);
    expect(judge(forbidPlaintextSecrets)).toEqual([]);
  });
});

describe('secrets.addresses', () => {
  test('loopback, unspecified, broadcast and documentation addresses and non-addresses pass', () => {
    writeRepositoryFile(
      root,
      'apps/one/hosts.txt',
      [
        '127.0.0.1 127.12.0.9 0.0.0.0 255.255.255.255',
        '192.0.2.10 198.51.100.7 203.0.113.255',
        'versions 1.2.3.4.5 v10.0.0.1 bun-1.4.5 999.1.1.1',
        '',
      ].join('\n'),
    );
    expect(judge(forbidStateAddresses)).toEqual([]);
  });

  test.each([
    ['after an equals sign', `host=${forbiddenAddress}`],
    ['with a port', `${forbiddenAddress}:22`],
    ['beside a documentation address', `192.0.2.1 ${[172, 16, 4, 2].join('.')}`],
  ])('an address %s is found', (_name, line) => {
    writeRepositoryFile(root, 'apps/one/hosts.txt', `${line}\n`);
    expect(judge(forbidStateAddresses)).toEqual([
      {
        rule: 'secrets.addresses',
        path: 'apps/one/hosts.txt',
        message: 'line 1 holds an IPv4 address',
      },
    ]);
  });

  test('a binary file is not read for addresses', () => {
    writeRepositoryFile(root, 'apps/one/logo.bin', `\0${forbiddenAddress}`);
    expect(judge(forbidStateAddresses)).toEqual([]);
  });
});

describe('code.header', () => {
  test.each([
    ['a comment then a blank line', '// Restarts.\n\nexport const a = 1;\n'],
    ['a block comment then an import', "/* Ops. */\nimport { a } from './a';\n"],
    ['a multi-line block then a blank line', '/**\n * The file.\n */\n\nexport const a = 1;\n'],
    ['a shebang, a comment, then an import', "#!/usr/bin/env bun\n// x\nimport './a';\n"],
    ['nothing but a comment', '// x\n'],
  ])('%s is a header', (_name, text) => {
    expect(opensWithHeader(text)).toBe(true);
  });

  test.each([
    ['JSDoc on the first declaration', '/** One. */\nexport const a = 1;\n'],
    ['a multi-line JSDoc on the first declaration', '/**\n * One.\n */\nexport const a = 1;\n'],
    ['an import first', "import { a } from './a';\n\n// later\n"],
    ['code first', 'export const a = 1;\n'],
  ])('%s is no header', (_name, text) => {
    expect(opensWithHeader(text)).toBe(false);
  });

  test('tests and test hosts may open with a comment', () => {
    writeRepositoryFile(root, 'apps/one/src/x.test.ts', '// x\n\nexport const a = 1;\n');
    writeRepositoryFile(root, 'apps/one/src/x.test-host.ts', '// x\n\nexport const a = 1;\n');
    expect(judge(forbidFileHeaders)).toEqual([]);
  });
});

describe('docs.commands judges Nx project names', () => {
  test('known projects, Nx commands, placeholders and other tools pass', () => {
    appendFileSync(
      join(root, 'README.md'),
      [
        '`bunx nx run one:test` `nx test one` `nx run-many -t test -p one,workspace`',
        '`nx affected -t lint` `nx format:check --all` `nx run <project>:<target>`',
        '`nx show projects` `bunx tsc --noEmit -p apps/one/tsconfig.json` `nx run-many -t lint -p "one-*"`',
        '',
      ].join('\n'),
    );
    expect(judge(judgeDocCommands)).toEqual([]);
  });

  test.each([
    ['a target then an unknown project', '`nx test onee`', 'onee'],
    ['an unknown project among -p names', '`nx run-many -t test -p one,twoo`', 'twoo'],
    ['an unknown project after --projects', '`nx run-many -t lint --projects=gone`', 'gone'],
  ])('%s is found', (_name, line, name) => {
    appendFileSync(join(root, 'README.md'), `${line}\n`);
    expect(judge(judgeDocCommands)).toEqual([
      { rule: 'docs.commands', path: 'README.md', message: `names no Nx project ${name}` },
    ]);
  });
});

describe('heading anchors', () => {
  test.each([
    ['Gate failures', 'gate-failures'],
    ['`nx sync:check` fails', 'nx-synccheck-fails'],
    ['What [the gate](gate.md) does', 'what-the-gate-does'],
    ['Kinds & names: 2', 'kinds--names-2'],
    ['snake_case Ünïcode', 'snake_case-ünïcode'],
  ])('%s is #%s', (heading, anchor) => {
    expect(slugHeading(heading)).toBe(anchor);
  });

  test('repeated headings are suffixed, closing hashes and fenced headings are ignored', () => {
    const text = '# Steps\n## Steps ##\n### Steps\n```md\n# Fenced\n```\n';
    expect([...listAnchors(text)]).toEqual(['steps', 'steps-1', 'steps-2']);
  });

  test('a link to an existing heading of another file, and a bare one to its own, pass', () => {
    writeRepositoryFile(
      root,
      'wiki/ops/run.md',
      '# Run\n\n## Run\n\n[a](../../README.md#demo) [b](#run-1) [c](../../AGENTS.md)\n',
    );
    appendFileSync(join(root, 'README.md'), 'See `wiki/ops/run.md#run`.\n');
    expect([...judge(resolveLinks), ...judge(judgeDocPaths)]).toEqual([]);
  });

  test('a bare fragment naming no heading of its own file is found', () => {
    writeRepositoryFile(root, 'wiki/ops/run.md', '# Run\n\n[b](#walk)\n');
    expect(judge(resolveLinks)).toEqual([
      {
        rule: 'links.resolve',
        path: 'wiki/ops/run.md',
        message: 'links to #walk, but wiki/ops/run.md has no heading with the anchor #walk',
      },
    ]);
  });
});
