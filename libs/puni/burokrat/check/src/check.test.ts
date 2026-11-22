import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { indexFile } from '@puni/shared-checkout';
import { removeFixture, runGit, writeProject, writeRepositoryFile } from '@puni/shared-testing';
import { agentsWordBudget, indexWordBudget, readmeWordBudget } from './budgets';
import { type CheckHost, dropRemedies, type Judged, openCheckHost } from './check.test-host';
import { gitListingRemedy, type Rule } from './finding';
import { codeRules, crossProjectRules, ruleSets, stagedRules } from './rule-set.rule';
import {
  agentsExists,
  agentsNamesIndex,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './rules/entry.rule';
import { confineRecordsName, forbidDates } from './rules/history.rule';
import {
  limitIndexWords,
  matchGeneratedIndex,
  requireReadFirst,
  requireReadWhen,
} from './rules/index.rule';
import { resolveLinks } from './rules/links.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { requireProjectTargets } from './rules/project.rule';
import { forbidPlaintextSecrets } from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate } from './rules/workspace.rule';
import { credentialLookalikes, credentialSamples } from './secrets.test-host';
import { makeRepository } from './repository-pair.test-host';

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRepository();
});

afterEach(() => {
  removeFixture(root);
});

function judge(rule: Rule): Judged[] {
  return dropRemedies(host.judge(rule, root));
}

function words(count: number): string {
  return `${'word '.repeat(count - 1)}wiki/index/index.md\n`;
}

const recordsName = ['demo', 'records'].join('-');

describe('every rule holds on the fixture repository', () => {
  test.each(codeRules.map(({ rule }) => [rule.id, rule] as const))('%s', (_name, rule) => {
    expect(judge(rule)).toEqual([]);
  });
});

/** A breach and the one finding it makes; `remedy` is given only where it is not the rule's own. */
type Expected = Judged & { readonly remedy?: string };

const negatives: readonly (readonly [string, Rule, () => void, Expected])[] = [
  [
    'AGENTS.md missing',
    agentsExists,
    () => {
      rmSync(join(root, 'AGENTS.md'));
    },
    { rule: 'agents.exists', path: 'AGENTS.md', message: 'is missing' },
  ],
  [
    'AGENTS.md over budget',
    agentsWords,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', words(agentsWordBudget + 1));
    },
    {
      rule: 'agents.words',
      path: 'AGENTS.md',
      message: `has ${String(agentsWordBudget + 1)} words; at most ${String(agentsWordBudget)}`,
    },
  ],
  [
    'AGENTS.md not naming the index',
    agentsNamesIndex,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', '# demo\n');
    },
    { rule: 'agents.index', path: 'AGENTS.md', message: 'does not name wiki/index/index.md' },
  ],
  [
    'CLAUDE.md missing',
    claudeLinksAgents,
    () => {
      rmSync(join(root, 'CLAUDE.md'));
    },
    { rule: 'claude.symlink', path: 'CLAUDE.md', message: 'is missing' },
  ],
  [
    'CLAUDE.md a regular file',
    claudeLinksAgents,
    () => {
      rmSync(join(root, 'CLAUDE.md'));
      writeRepositoryFile(root, 'CLAUDE.md', 'copy');
    },
    { rule: 'claude.symlink', path: 'CLAUDE.md', message: 'is not a symlink to AGENTS.md' },
  ],
  [
    'CLAUDE.md linking elsewhere',
    claudeLinksAgents,
    () => {
      rmSync(join(root, 'CLAUDE.md'));
      symlinkSync('README.md', join(root, 'CLAUDE.md'));
    },
    { rule: 'claude.symlink', path: 'CLAUDE.md', message: 'points to README.md, not AGENTS.md' },
  ],
  [
    'README.md missing',
    readmeExists,
    () => {
      rmSync(join(root, 'README.md'));
    },
    { rule: 'readme.exists', path: 'README.md', message: 'is missing' },
  ],
  [
    'README.md over budget',
    readmeWords,
    () => {
      writeRepositoryFile(root, 'README.md', words(readmeWordBudget + 1));
    },
    {
      rule: 'readme.words',
      path: 'README.md',
      message: `has ${String(readmeWordBudget + 1)} words; at most ${String(readmeWordBudget)}`,
    },
  ],
  [
    'a date in README.md',
    forbidDates,
    () => {
      appendFileSync(join(root, 'README.md'), 'Since 2031-04-05.\n');
    },
    { rule: 'history.date', path: 'README.md', message: 'line 4 holds the date 2031-04-05' },
  ],
  [
    'a date in a wiki page',
    forbidDates,
    () => {
      writeRepositoryFile(root, 'wiki/ops/log.md', 'On 2031-04-05.\n');
    },
    { rule: 'history.date', path: 'wiki/ops/log.md', message: 'line 1 holds the date 2031-04-05' },
  ],
  [
    'a tracked file naming the records repository',
    confineRecordsName,
    () => {
      writeRepositoryFile(root, 'notes.txt', `see ${recordsName}\n`);
      runGit(root, ['add', 'notes.txt']);
    },
    {
      rule: 'history.records',
      path: 'notes.txt',
      message: `names the records repository ${recordsName}`,
    },
  ],
  [
    'git failing',
    confineRecordsName,
    () => {
      rmSync(join(root, '.git'), { recursive: true });
      mkdirSync(join(root, '.git'));
    },
    {
      rule: 'history.records',
      path: '.',
      message:
        'git ls-files exited 128: fatal: not a git repository (or any of the parent directories): .git',
      remedy: gitListingRemedy,
    },
  ],
  [
    'a broken link',
    resolveLinks,
    () => {
      writeRepositoryFile(root, 'wiki/ops/deploy.md', 'See [the runbook](../runbook.md#steps).\n');
    },
    {
      rule: 'links.resolve',
      path: 'wiki/ops/deploy.md',
      message: 'links to missing ../runbook.md',
    },
  ],
  [
    'a stale index',
    matchGeneratedIndex,
    () => {
      appendFileSync(join(root, indexFile), 'x');
    },
    {
      rule: 'index.current',
      path: indexFile,
      message: 'is stale',
    },
  ],
  [
    'a missing index',
    matchGeneratedIndex,
    () => {
      rmSync(join(root, indexFile));
    },
    {
      rule: 'index.current',
      path: indexFile,
      message: 'is missing',
    },
  ],
  [
    'an unexpected file in the index',
    matchGeneratedIndex,
    () => {
      writeRepositoryFile(root, 'wiki/index/modules.md', 'old');
    },
    {
      rule: 'index.current',
      path: 'wiki/index/modules.md',
      message: 'is not generated',
    },
  ],
  [
    'an index that cannot be generated',
    matchGeneratedIndex,
    () => {
      writeProject(root, 'libs/two', 'two', {});
    },
    {
      rule: 'index.current',
      path: 'wiki/index',
      message: 'cannot be generated: 2 index.read-when or index.read-first findings',
      remedy: 'fix the index.read-when and index.read-first findings, then run `bun run fix`',
    },
  ],
  [
    'an index over budget',
    limitIndexWords,
    () => {
      writeRepositoryFile(root, indexFile, words(indexWordBudget + 1));
    },
    {
      rule: 'index.words',
      path: indexFile,
      message: `has ${String(indexWordBudget + 1)} words; at most ${String(indexWordBudget)}`,
    },
  ],
  [
    'a project without readWhen',
    requireReadWhen,
    () => {
      writeProject(root, 'libs/two', 'two', { readFirst: 'src/index.ts' });
    },
    {
      rule: 'index.read-when',
      path: 'libs/two/project.json',
      message: 'project two has no metadata.readWhen',
    },
  ],
  [
    'a project whose readFirst names a missing file',
    requireReadFirst,
    () => {
      writeProject(root, 'libs/two', 'two', {
        readWhen: 'adding to two',
        readFirst: 'src/gone.ts',
      });
    },
    {
      rule: 'index.read-first',
      path: 'libs/two/project.json',
      message: 'project two metadata.readFirst names a missing file',
    },
  ],
  [
    'a page without read-when',
    requireReadWhen,
    () => {
      writeRepositoryFile(root, 'wiki/deploy.md', '---\ntitle: Deploy\n---\n');
    },
    { rule: 'index.read-when', path: 'wiki/deploy.md', message: 'has no read-when' },
  ],
  ...credentialSamples.map(([shape, sample]): readonly [string, Rule, () => void, Expected] => [
    `${shape} in a file`,
    forbidPlaintextSecrets,
    () => {
      writeRepositoryFile(root, 'apps/one/src/settings.ts', `// settings\n${sample}\n`);
    },
    {
      rule: 'secrets.plaintext',
      path: 'apps/one/src/settings.ts',
      message: `line 2 holds what looks like ${shape}`,
    },
  ]),
  [
    'a project without a lint target',
    requireProjectTargets,
    () => {
      const path = join(root, 'apps/one/project.json');
      const project = JSON.parse(readFileSync(path, 'utf8')) as { targets: { lint?: unknown } };
      delete project.targets.lint;
      writeFileSync(path, JSON.stringify(project));
    },
    {
      rule: 'project.targets',
      path: 'apps/one/project.json',
      message: 'project one has no lint target',
      remedy:
        'add a lint target to apps/one/project.json, declared as the other projects declare theirs',
    },
  ],
  [
    'an application without a build target',
    requireProjectTargets,
    () => {
      const path = join(root, 'apps/one/project.json');
      const project = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      writeFileSync(path, JSON.stringify({ ...project, projectType: 'application' }));
    },
    {
      rule: 'project.targets',
      path: 'apps/one/project.json',
      message: 'project one has no build target',
      remedy:
        'add a build target to apps/one/project.json, declared as the other projects declare theirs',
    },
  ],
  [
    'a target running the nx.json default bun test without --timeout',
    requireProjectTargets,
    () => {
      const path = join(root, 'apps/one/project.json');
      const project = JSON.parse(readFileSync(path, 'utf8')) as { targets: { test?: unknown } };
      project.targets.test = {};
      writeFileSync(path, JSON.stringify(project));
      const defaults = { test: { options: { command: 'bun test src' } } };
      writeRepositoryFile(root, 'nx.json', JSON.stringify({ targetDefaults: defaults }));
    },
    {
      rule: 'project.targets',
      path: 'apps/one/project.json',
      message: 'target test runs bun test without --timeout',
      remedy: 'add --timeout=20000 to the bun test command of target test',
    },
  ],
  [
    'a tsconfig.json not including src',
    requireProjectTargets,
    () => {
      writeRepositoryFile(root, 'apps/one/tsconfig.json', JSON.stringify({ include: ['lib'] }));
    },
    {
      rule: 'project.targets',
      path: 'apps/one/tsconfig.json',
      message: 'does not include src, so typecheck does not see project one',
      remedy: 'make apps/one/tsconfig.json a JSON object whose include lists "src/**/*.ts"',
    },
  ],
  [
    'a bun test without --timeout',
    requireProjectTargets,
    () => {
      const path = join(root, 'apps/one/project.json');
      const text = readFileSync(path, 'utf8').replace(' --timeout=20000', '');
      writeFileSync(path, text);
    },
    {
      rule: 'project.targets',
      path: 'apps/one/project.json',
      message: 'target test runs bun test without --timeout',
      remedy: 'add --timeout=20000 to the bun test command of target test',
    },
  ],
  [
    'a backticked path that does not exist',
    judgeDocPaths,
    () => {
      appendFileSync(join(root, 'README.md'), 'Deploy with `bin/deploy.sh` from `apps/`.\n');
    },
    { rule: 'docs.paths', path: 'README.md', message: 'names the missing path bin/deploy.sh' },
  ],
  [
    'a bun run naming no script',
    judgeDocCommands,
    () => {
      appendFileSync(join(root, 'README.md'), 'Then `bun run nope`.\n');
    },
    {
      rule: 'docs.commands',
      path: 'README.md',
      message: 'runs the script nope, which package.json does not define',
      remedy: 'name a script the root package.json defines, or add the script there',
    },
  ],
  [
    'a command the tree does not hold',
    judgeDocCommands,
    () => {
      writeRepositoryFile(
        root,
        'wiki/ops/run.md',
        '---\ntitle: Run\nread-when: running\n---\n\n```sh\ndemo burokrat audit --all\n```\n',
      );
    },
    {
      rule: 'docs.commands',
      path: 'wiki/ops/run.md',
      message: 'names no command demo burokrat audit',
    },
  ],
  [
    'AGENTS.md giving another records checkout',
    matchRecordsLocation,
    () => {
      const path = join(root, 'AGENTS.md');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace('`../demo-records`', '`../demo-notes`'),
      );
    },
    {
      rule: 'agents.records',
      path: 'AGENTS.md',
      message: 'gives the records checkout ../demo-notes, not ../demo-records',
      remedy:
        'write the records repository as https://github.com/acme/demo-records, checked out as `../demo-records`',
    },
  ],
  [
    'a CI workflow without the affected gate',
    requireCiGate,
    () => {
      const path = join(root, '.github/workflows/ci.yml');
      writeFileSync(path, readFileSync(path, 'utf8').replace('bun run gate:affected', 'echo'));
    },
    {
      rule: 'ci.gate',
      path: '.github/workflows/ci.yml',
      message: 'does not run bun run gate:affected',
    },
  ],
  [
    'no CI workflow',
    requireCiGate,
    () => {
      rmSync(join(root, '.github'), { recursive: true });
    },
    { rule: 'ci.gate', path: '.github/workflows/ci.yml', message: 'is missing' },
  ],
];

describe('each rule finds its breach', () => {
  test.each(negatives)('%s', (_name, rule, breach, finding) => {
    breach();
    expect(host.judge(rule, root)).toEqual([{ ...finding, remedy: finding.remedy ?? rule.remedy }]);
  });

  test('the breaches cover every rule of the system-state rule set', () => {
    expect(new Set(negatives.map(([, rule]) => rule))).toEqual(
      new Set(codeRules.map(({ rule }) => rule)),
    );
  });

  test('every rule of every rule set names its id and a remedy', () => {
    const everyRule = [
      ...Object.values(ruleSets).flatMap((rules) => rules.map(({ rule }) => rule)),
      ...crossProjectRules,
      ...stagedRules,
    ];
    for (const rule of everyRule) {
      expect([rule.id, /^[a-z]+\.[a-z-]+$/u.test(rule.id)]).toEqual([rule.id, true]);
      expect([rule.id, rule.remedy.length > 0]).toEqual([rule.id, true]);
    }
  });
});

describe('rule boundaries', () => {
  test('text near the credential shapes is no secrets.plaintext finding', () => {
    writeRepositoryFile(root, 'apps/one/src/near.ts', `${credentialLookalikes.join('\n')}\n`);
    expect(judge(forbidPlaintextSecrets)).toEqual([]);
  });

  test('a binary file is not read for secrets', () => {
    writeRepositoryFile(root, 'apps/one/logo.bin', `\0${credentialSamples[1]?.[1] ?? ''}`);
    expect(judge(forbidPlaintextSecrets)).toEqual([]);
  });

  test('a backticked path into another project is judged only by the cross-project reach', () => {
    writeRepositoryFile(root, 'wiki/ops/one.md', 'See `apps/one/src/gone.ts`.\n');
    const projects = host.container
      .resolve('checkoutProjectScope')
      .list(host.container.resolve('checkoutFiles').open(root));
    const finding = {
      rule: 'docs.paths',
      path: 'wiki/ops/one.md',
      message: 'names the missing path apps/one/src/gone.ts',
    };
    const reach = (kind: 'within-project' | 'cross-project') =>
      dropRemedies(host.judge(judgeDocPaths, root, root, undefined, { kind, projects }));
    expect(reach('within-project')).toEqual([]);
    expect(reach('cross-project')).toEqual([finding]);
    expect(judge(judgeDocPaths)).toEqual([finding]);
  });

  test('globs, placeholders, flags, URLs and paths above the root are not paths', () => {
    appendFileSync(
      join(root, 'README.md'),
      '`src/*.ts` `nav/<slug>.md` `--out=dist/x.js` `https://x.dev/a.md` `../demo-records/a.md` `@puni/shared-x` `a/b`\n',
    );
    expect(judge(judgeDocPaths)).toEqual([]);
  });

  test('flags and placeholders end the words, and prose names no command', () => {
    appendFileSync(
      join(root, 'README.md'),
      'Run `demo burokrat --help` or `demo dash NAME`; demo burokrat judges, in prose.\n',
    );
    expect(judge(judgeDocCommands)).toEqual([]);
  });

  test('a leaf takes arguments, but a group takes a command', async () => {
    const leaves = openCheckHost(undefined, [
      { path: 'demo burokrat', brief: 'Judge.' },
      { path: 'demo burokrat check', brief: 'Check.' },
      { path: 'demo burokrat wiki', brief: 'Wiki.' },
      { path: 'demo burokrat wiki index', brief: 'Index.' },
    ]);
    try {
      appendFileSync(
        join(root, 'README.md'),
        '`demo burokrat check here` `demo burokrat wiki index now` `demo burokrat wiki nope`\n',
      );
      expect(dropRemedies(leaves.judge(judgeDocCommands, root))).toEqual([
        {
          rule: 'docs.commands',
          path: 'README.md',
          message: 'names no command demo burokrat wiki nope',
        },
      ]);
    } finally {
      await leaves.close();
    }
  });

  test('an untracked file naming the records repository is judged as if it were staged', () => {
    writeRepositoryFile(root, 'notes.txt', `see ${recordsName}\n`);
    const untracked = judge(confineRecordsName);
    runGit(root, ['add', 'notes.txt']);
    expect(untracked).toHaveLength(1);
    expect(judge(confineRecordsName)).toEqual(untracked);
  });

  test('an ignored file naming the records repository is not judged', () => {
    writeRepositoryFile(root, '.gitignore', 'scratch/\n');
    writeRepositoryFile(root, 'scratch/notes.txt', `see ${recordsName}\n`);
    expect(judge(confineRecordsName)).toEqual([]);
  });

  test('URLs, fragments, links above the root and fenced code are not checked', () => {
    writeRepositoryFile(
      root,
      'wiki/ops/deploy.md',
      [
        '[web](https://example.com/x) [frag](#top) [up](../../../outside.md) [ok](../../README.md)',
        '```md',
        '[fenced](missing.md)',
        '```',
        '',
      ].join('\n'),
    );
    expect(judge(resolveLinks)).toEqual([]);
  });
});

describe('the check command', () => {
  function runIn(cwd: string): { code: 0 | 1 | 2; printed: string } {
    const run = host.runCheck({}, cwd);
    if (run.stderr !== '') throw new Error(`unexpected stderr: ${run.stderr}`);
    return { code: run.code, printed: run.stdout };
  }

  test('a clean repository prints one ok line and exits 0', () => {
    expect(runIn(root)).toEqual({
      code: 0,
      printed: `ok: system-state, ${String(codeRules.length)} rules, no findings.\n`,
    });
  });

  test('findings print sorted, then a summary, and exit 1', () => {
    rmSync(join(root, 'README.md'));
    writeFileSync(join(root, 'AGENTS.md'), '# demo\n');
    expect(runIn(root)).toEqual({
      code: 1,
      printed: [
        'agents.index AGENTS.md: does not name wiki/index/index.md; fix: name wiki/index/index.md in AGENTS.md as the map to read first',
        'agents.records AGENTS.md: does not give the records checkout ../demo-records; fix: write the records repository as https://github.com/acme/demo-records, checked out as `../demo-records`',
        'agents.records AGENTS.md: does not give the records repository URL https://github.com/acme/demo-records; fix: write the records repository as https://github.com/acme/demo-records, checked out as `../demo-records`',
        'readme.exists README.md: is missing; fix: create README.md at the root: what the repository is, for a person arriving',
        `fail: system-state, ${String(codeRules.length)} rules, 4 findings.`,
        '',
      ].join('\n'),
    });
  });

  test('no puni.json is a repository.root finding', () => {
    rmSync(join(root, 'puni.json'));
    const run = runIn(root);
    expect(run.code).toBe(1);
    expect(run.printed).toMatch(
      /^repository\.root \.: no puni\.json in [^\n]+; fix: run puni from the system-state repository or a directory in it\nfail: no repository, 1 finding\.\n$/u,
    );
  });

  test('an invalid puni.json is a repository.config finding', () => {
    writeRepositoryFile(root, 'puni.json', JSON.stringify({ 'all-repos': [] }));
    const run = runIn(root);
    expect(run.code).toBe(1);
    expect(run.printed).toBe(
      `repository.config puni.json: ${join(root, 'puni.json')} all-repos is []; expected a non-empty array; fix: correct puni.json as the message says: this-repo-type, and all-repos listing every type once\nfail: no repository, 1 finding.\n`,
    );
  });
});
