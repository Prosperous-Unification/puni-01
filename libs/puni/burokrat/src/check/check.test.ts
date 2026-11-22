import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentsWordBudget, indexWordBudget, readmeWordBudget } from '../budgets';
import {
  fixtureCommands,
  makeRepository,
  removeFixture,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '../repository-fixture';
import { indexFile } from '../wiki/wiki-index';
import { runCheck } from './check';
import {
  agentsExists,
  agentsNamesIndex,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './entry-rules';
import type { Finding, Rule } from './finding';
import { repositoryScope } from './scope';
import { readRegistry } from '../registry';
import { confineRecordsName, forbidDates } from './history-rules';
import {
  limitIndexWords,
  matchGeneratedIndex,
  requireReadFirst,
  requireReadWhen,
} from './index-rules';
import { resolveLinks } from './link-rules';
import { codeRules } from './rules';

let root = '';

beforeEach(() => {
  root = makeRepository();
});

afterEach(() => {
  removeFixture(root);
});

function judge(rule: Rule): Finding[] {
  return rule({
    root,
    registry: readRegistry(root),
    commands: fixtureCommands,
    scope: repositoryScope,
  });
}

function words(count: number): string {
  return `${'word '.repeat(count - 1)}wiki/index/index.md\n`;
}

const recordsName = ['demo', 'records'].join('-');

describe('every rule holds on the fixture repository', () => {
  test.each(codeRules.map((rule) => [rule.judge.name, rule.judge] as const))(
    '%s',
    (_name, rule) => {
      expect(judge(rule)).toEqual([]);
    },
  );
});

const negatives: readonly (readonly [string, Rule, () => void, Finding])[] = [
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
      message: 'is stale; run `puni burokrat wiki index`',
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
      message: 'is missing; run `puni burokrat wiki index`',
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
      message: 'is not generated; run `puni burokrat wiki index`',
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
];

describe('each rule finds its breach', () => {
  test.each(negatives)('%s', (_name, rule, breach, finding) => {
    breach();
    expect(judge(rule)).toEqual([finding]);
  });
});

describe('rule boundaries', () => {
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

describe('runCheck', () => {
  function runIn(cwd: string): { code: 0 | 1 | 2; printed: string } {
    let printed = '';
    const code = runCheck(
      {},
      {
        cwd,
        stderr: (text) => {
          throw new Error(`unexpected stderr: ${text}`);
        },
        commands: fixtureCommands,
        stdout: (text) => {
          printed += text;
        },
      },
    );
    return { code, printed };
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
        'agents.index AGENTS.md: does not name wiki/index/index.md',
        'readme.exists README.md: is missing',
        `fail: system-state, ${String(codeRules.length)} rules, 2 findings.`,
        '',
      ].join('\n'),
    });
  });

  test('no puni.json is a repository.root finding', () => {
    rmSync(join(root, 'puni.json'));
    const run = runIn(root);
    expect(run.code).toBe(1);
    expect(run.printed).toMatch(
      /^repository\.root \.: no puni\.json in [^\n]+\nfail: no repository, 1 finding\.\n$/u,
    );
  });

  test('an invalid puni.json is a repository.config finding', () => {
    writeRepositoryFile(root, 'puni.json', JSON.stringify({ 'all-repos': [] }));
    const run = runIn(root);
    expect(run.code).toBe(1);
    expect(run.printed).toBe(
      `repository.config puni.json: ${join(root, 'puni.json')} all-repos is []; expected a non-empty array\nfail: no repository, 1 finding.\n`,
    );
  });
});
