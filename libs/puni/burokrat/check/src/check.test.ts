import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { indexFile } from '@puni/shared-checkout';
import {
  removeScratchDirectoriesAfterEach,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { agentsWordBudget, indexWordBudget, pageWordBudget, readmeWordBudget } from './budgets';
import { digestRulesSection } from './agents-rules';
import {
  type CheckHost,
  dropRemedies,
  fixtureAgentsKeepRules,
  fixtureRuleSets,
  type Judged,
  openCheckHost,
} from './check.test-host';
import type { Rule } from './finding';
import { codeRules, crossProjectRules, ruleSets, secretRules } from './rule-set.rule';
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
  requireScope,
  requireSection,
} from './rules/index.rule';
import { resolveLinks } from './rules/links.rule';
import { judgeDocSymbols, limitPageWords } from './rules/wiki.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { requireProjectTargets } from './rules/project.rule';
import { forbidFileHeaders } from './rules/code.rule';
import { forbidPlaintextSecrets, forbidStateAddresses } from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate, requireIndexSync } from './rules/workspace.rule';
import { credentialLookalikes, credentialSamples, forbiddenAddress } from './secrets.test-host';
import { fixtureAgentsRules, makeRepository } from './repository-pair.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRepository(scratchDirectories);
});

function judge(rule: Rule): Judged[] {
  return dropRemedies(host.judge(rule, root));
}

function words(count: number): string {
  return `${'word '.repeat(count - 1)}wiki/index/index.md\n`;
}

const recordsName = ['demo', 'records'].join('-');

/** Replaces the one `from` in the fixture's `AGENTS.md` with `to`. */
function editAgents(from: string, to: string): void {
  const path = join(root, 'AGENTS.md');
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`AGENTS.md does not hold ${from}`);
  writeFileSync(path, text.replace(from, to));
}

const fixtureCodeRules = fixtureRuleSets['system-state'];

describe('every rule holds on the fixture repository', () => {
  test.each(fixtureCodeRules.map(({ rule }) => [rule.id, rule] as const))('%s', (_name, rule) => {
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
      message:
        'cannot be generated: 2 index.read-when, index.read-first, index.scope or index.section findings',
      remedy:
        'fix the index.read-when, index.read-first, index.scope and index.section findings, then run `bun run puni burokrat wiki index`',
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
    'an index partition over budget, the index file within it',
    limitIndexWords,
    () => {
      writeRepositoryFile(root, 'wiki/index/app.md', words(indexWordBudget + 1));
    },
    {
      rule: 'index.words',
      path: 'wiki/index/app.md',
      message: `has ${String(indexWordBudget + 1)} words; at most ${String(indexWordBudget)}`,
    },
  ],
  [
    'a project without a scope tag',
    requireScope,
    () => {
      writeRepositoryFile(
        root,
        'libs/two/project.json',
        JSON.stringify({
          name: 'two',
          metadata: { readWhen: 'adding to two', readFirst: 'src/index.ts' },
        }),
      );
      writeRepositoryFile(root, 'libs/two/src/index.ts', 'export {};\n');
    },
    {
      rule: 'index.scope',
      path: 'libs/two/project.json',
      message: 'project two has no scope:<name> tag',
    },
  ],
  [
    'a page in a directory that is no section',
    requireSection,
    () => {
      writeRepositoryFile(
        root,
        'wiki/ops/deploy.md',
        '---\ntitle: Deploy\nread-when: deploying\n---\n',
      );
    },
    {
      rule: 'index.section',
      path: 'wiki/ops/deploy.md',
      message: 'lies in wiki/ops/, which is not wiki/ or a section (wiki/concepts/, wiki/how-to/)',
    },
  ],
  [
    'a page nested below a section',
    requireSection,
    () => {
      writeRepositoryFile(
        root,
        'wiki/how-to/ops/deploy.md',
        '---\ntitle: Deploy\nread-when: deploying\n---\n',
      );
    },
    {
      rule: 'index.section',
      path: 'wiki/how-to/ops/deploy.md',
      message:
        'lies in wiki/how-to/ops/, which is not wiki/ or a section (wiki/concepts/, wiki/how-to/)',
    },
  ],
  [
    'a page over budget',
    limitPageWords,
    () => {
      writeRepositoryFile(root, 'wiki/how-to/deploy.md', words(pageWordBudget + 1));
    },
    {
      rule: 'docs.words',
      path: 'wiki/how-to/deploy.md',
      message: `has ${String(pageWordBudget + 1)} words; at most ${String(pageWordBudget)}`,
    },
  ],
  [
    'a page naming a symbol no source file holds',
    judgeDocSymbols,
    () => {
      writeRepositoryFile(root, 'libs/two/src/index.ts', 'export const renderIndex = 1;\n');
      writeRepositoryFile(
        root,
        'wiki/how-to/deploy.md',
        '---\ntitle: Deploy\nread-when: deploying\n---\n\nCall `renderIndex`, then `renderPages(pages)`; in prose, renderGone is no symbol.\n',
      );
    },
    {
      rule: 'docs.symbols',
      path: 'wiki/how-to/deploy.md',
      message: 'names renderPages, which no source file holds',
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
    'a backticked path git ignores, though it exists on this disk',
    judgeDocPaths,
    () => {
      writeRepositoryFile(root, '.gitignore', 'dist/\n');
      writeRepositoryFile(root, 'dist/cli.js', 'built\n');
      appendFileSync(join(root, 'README.md'), 'Run `dist/cli.js`.\n');
    },
    { rule: 'docs.paths', path: 'README.md', message: 'names the missing path dist/cli.js' },
  ],
  [
    'a link to a file git ignores, though it exists on this disk',
    resolveLinks,
    () => {
      writeRepositoryFile(root, '.gitignore', 'dist/\n');
      writeRepositoryFile(root, 'dist/notes.md', 'built\n');
      writeRepositoryFile(root, 'wiki/ops/built.md', 'See [notes](../../dist/notes.md).\n');
    },
    {
      rule: 'links.resolve',
      path: 'wiki/ops/built.md',
      message: 'links to missing ../../dist/notes.md',
    },
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
  ...(
    [
      [
        'a sentence appended inside its rules section',
        'its cause.',
        'its cause. Rules are for other people.',
      ],
      ['a word changed in a rule body', 'names its cause', 'hides its cause'],
    ] as const
  ).map(
    ([change, from, to]) =>
      [
        `AGENTS.md with ${change}`,
        fixtureAgentsKeepRules,
        () => {
          editAgents(from, to);
        },
        {
          rule: 'agents.rules',
          path: 'AGENTS.md',
          message: `rules section digests to ${digestRulesSection(fixtureAgentsRules.replace(from, to))}, not the pinned ${digestRulesSection(fixtureAgentsRules)}`,
        },
      ] as const,
  ),
  [
    'AGENTS.md without its ## Rules heading',
    fixtureAgentsKeepRules,
    () => {
      editAgents('## Rules\n', 'Rules\n');
    },
    { rule: 'agents.rules', path: 'AGENTS.md', message: 'has no ## Rules heading' },
  ],
  [
    'CLAUDE.md a directory',
    claudeLinksAgents,
    () => {
      rmSync(join(root, 'CLAUDE.md'));
      mkdirSync(join(root, 'CLAUDE.md'));
    },
    {
      rule: 'claude.symlink',
      path: 'CLAUDE.md',
      message: 'is a directory, not a symlink to AGENTS.md',
      remedy: 'remove the directory, then link: rm -r CLAUDE.md && ln -s AGENTS.md CLAUDE.md',
    },
  ],
  [
    'nx.json without the index sync generator',
    requireIndexSync,
    () => {
      writeRepositoryFile(root, 'nx.json', JSON.stringify({ sync: { globalGenerators: [] } }));
    },
    {
      rule: 'nx.sync',
      path: 'nx.json',
      message: 'does not list @puni/nx-sync:wiki-index in sync.globalGenerators',
    },
  ],
  [
    'an IPv4 address in a file',
    forbidStateAddresses,
    () => {
      writeRepositoryFile(root, 'apps/one/hosts.txt', `primary\nhost ${forbiddenAddress}\n`);
    },
    {
      rule: 'secrets.addresses',
      path: 'apps/one/hosts.txt',
      message: 'line 2 holds an IPv4 address',
    },
  ],
  [
    'a source file opening with a header comment',
    forbidFileHeaders,
    () => {
      writeRepositoryFile(
        root,
        'apps/one/src/restart.ts',
        '// Restarts a node.\n// Written for ops.\n\nexport const a = 1;\n',
      );
    },
    {
      rule: 'code.header',
      path: 'apps/one/src/restart.ts',
      message: 'opens with a header comment',
    },
  ],
  [
    'the root project running bun test without --timeout',
    requireProjectTargets,
    () => {
      const targets = { test: { options: { command: 'bun test tests' } } };
      writeRepositoryFile(root, 'project.json', JSON.stringify({ name: 'workspace', targets }));
    },
    {
      rule: 'project.targets',
      path: 'project.json',
      message: 'target test runs bun test without --timeout',
      remedy: 'add --timeout=20000 to the bun test command of target test',
    },
  ],
  [
    'an nx run naming no project',
    judgeDocCommands,
    () => {
      appendFileSync(join(root, 'README.md'), 'Then `bunx nx run onee:test`.\n');
    },
    {
      rule: 'docs.commands',
      path: 'README.md',
      message: 'names no Nx project onee',
      remedy: 'name a project `bunx nx show projects` lists, or remove it',
    },
  ],
  [
    'a link to a heading that does not exist',
    resolveLinks,
    () => {
      writeRepositoryFile(
        root,
        'wiki/ops/deploy.md',
        'See [the index](../index/index.md#nowhere).\n',
      );
    },
    {
      rule: 'links.resolve',
      path: 'wiki/ops/deploy.md',
      message:
        'links to ../index/index.md#nowhere, but wiki/index/index.md has no heading with the anchor #nowhere',
      remedy: 'point the link at a heading of wiki/index/index.md, or drop the #nowhere',
    },
  ],
  [
    'a backticked path to a heading that does not exist',
    judgeDocPaths,
    () => {
      appendFileSync(join(root, 'README.md'), 'Read `wiki/index/index.md#nowhere`.\n');
    },
    {
      rule: 'docs.paths',
      path: 'README.md',
      message:
        'names wiki/index/index.md#nowhere, but wiki/index/index.md has no heading with the anchor #nowhere',
      remedy: 'name a heading of wiki/index/index.md, or drop the fragment',
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
      new Set(fixtureCodeRules.map(({ rule }) => rule)),
    );
  });

  test('every rule of every rule set names its id and a remedy', () => {
    const everyRule = [
      ...Object.values(ruleSets).flatMap((rules) => rules.map(({ rule }) => rule)),
      ...crossProjectRules,
      ...Object.values(secretRules).flat(),
    ];
    for (const rule of everyRule) {
      expect([rule.id, /^[a-z]+\.[a-z-]+$/u.test(rule.id)]).toEqual([rule.id, true]);
      expect([rule.id, rule.remedy.length > 0]).toEqual([rule.id, true]);
    }
  });
});

describe('rule boundaries', () => {
  test('docs.words holds a page of exactly the budget and judges only wiki pages', () => {
    writeRepositoryFile(root, 'wiki/how-to/deploy.md', words(pageWordBudget));
    writeRepositoryFile(root, 'README.md', words(pageWordBudget + 1));
    expect(judge(limitPageWords)).toEqual([]);
  });

  test('docs.symbols accepts a symbol only a JSON, YAML or shell file holds', () => {
    writeRepositoryFile(root, 'config/settings.json', '{ "retryLimit": 3 }\n');
    writeRepositoryFile(root, 'config/ci.yml', 'cacheKey: x\n');
    writeRepositoryFile(root, 'bin/run.sh', 'PUNI_HOME=/x\n');
    writeRepositoryFile(
      root,
      'wiki/how-to/deploy.md',
      '---\ntitle: Deploy\nread-when: deploying\n---\n\nSet `retryLimit`, `cacheKey` and `PUNI_HOME`.\n',
    );
    expect(judge(judgeDocSymbols)).toEqual([]);
  });

  test('a repository without nx.json holds no workspace: nx.sync and ci.gate judge nothing', () => {
    rmSync(join(root, 'nx.json'));
    rmSync(join(root, '.github'), { recursive: true });
    expect([...judge(requireIndexSync), ...judge(requireCiGate)]).toEqual([]);
    writeRepositoryFile(root, 'nx.json', '{}');
    expect([...judge(requireIndexSync), ...judge(requireCiGate)]).toEqual([
      {
        rule: 'nx.sync',
        path: 'nx.json',
        message: 'does not list @puni/nx-sync:wiki-index in sync.globalGenerators',
      },
      { rule: 'ci.gate', path: '.github/workflows/ci.yml', message: 'is missing' },
    ]);
  });

  test('the rules digest is FNV-1a 64 of the whitespace-normalised text', () => {
    expect(['', 'a', ' \n a\n'].map(digestRulesSection)).toEqual([
      'cbf29ce484222325',
      'af63dc4c8601ec8c',
      'af63dc4c8601ec8c',
    ]);
  });

  test('agents.rules judges only the rules section, and rewrapping it is no finding', () => {
    const heading = '## Rules\n';
    const body = fixtureAgentsRules.slice(heading.length);
    const rewrapped = `${heading}${body.replace(/\s+/gu, (space) => (space === ' ' ? '\n' : ' '))}`;
    expect(rewrapped).not.toBe(fixtureAgentsRules);
    editAgents(fixtureAgentsRules, `${rewrapped}\n## Later\n\nAnything goes here.\n`);
    expect(judge(fixtureAgentsKeepRules)).toEqual([]);
  });

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
      .list(host.container.resolve('checkoutFiles').open(root, 'system-state'));
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

  test('URLs, links above the root and fenced code are not checked; fragments name headings', () => {
    writeRepositoryFile(
      root,
      'wiki/ops/deploy.md',
      [
        '# Top',
        '',
        '[web](https://example.com/x) [frag](#top) [up](../../../outside.md) [ok](../../README.md#demo)',
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
  function runIn(cwd: string): { code: number; printed: string } {
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
    writeFileSync(join(root, 'AGENTS.md'), `# demo\n\n${fixtureAgentsRules}`);
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

describe('a link target the file system cannot describe is missing, not a crash', () => {
  const finding = (path: string, target: string) =>
    `links.resolve ${path}: links to missing ${target}; fix: point the link at a path that exists, or remove it`;

  function runCheck(request = {}): { code: number; stdout: string } {
    const run = host.runCheck(request, root);
    expect(run.stderr).toBe('');
    return { code: run.code, stdout: run.stdout };
  }

  test.each([
    ['below a file (ENOTDIR)', () => 'AGENTS.md/child'],
    [
      'a symlink loop (ELOOP)',
      () => {
        symlinkSync('loop', join(root, 'loop'));
        runGit(root, ['add', 'loop']);
        return 'loop';
      },
    ],
    ['a name too long (ENAMETOOLONG)', () => 'n'.repeat(300)],
    [
      'inside a directory that cannot be searched (EACCES)',
      () => {
        mkdirSync(join(root, 'locked'));
        chmodSync(join(root, 'locked'), 0o000);
        return 'locked/inside.md';
      },
    ],
  ])('a README.md link %s', (_name, makeTarget) => {
    const target = makeTarget();
    appendFileSync(join(root, 'README.md'), `[a](${target})\n`);
    try {
      const run = runCheck();
      expect(run.code).toBe(1);
      expect(run.stdout.split('\n')).toContain(finding('README.md', target));
    } finally {
      if (target.startsWith('locked/')) chmodSync(join(root, 'locked'), 0o700);
    }
  });

  test('a project-scoped link below a file is a finding of its project', () => {
    writeRepositoryFile(root, 'apps/one/notes.md', '[a](src/index.ts/child)\n');
    const run = runCheck({ project: 'one' });
    expect(run.code).toBe(1);
    expect(run.stdout).toStartWith(`${finding('apps/one/notes.md', 'src/index.ts/child')}\n`);
  });

  test('wiki/index replaced by a file leaves a project check ok', () => {
    rmSync(join(root, 'wiki/index'), { recursive: true });
    writeFileSync(join(root, 'wiki/index'), 'x\n');
    expect(runCheck({ project: 'one' })).toEqual({
      code: 0,
      stdout: 'ok: system-state, project one, 11 rules, no findings.\n',
    });
  });
});

describe('a git that cannot list the checkout', () => {
  test.each([
    [
      'no repository',
      () => {
        rmSync(join(root, '.git'), { recursive: true });
        mkdirSync(join(root, '.git'));
      },
    ],
    [
      'a corrupt index',
      () => {
        writeFileSync(join(root, '.git/index'), 'not an index');
      },
    ],
  ])('%s is one repository.git finding at the root', (_name, breakGit) => {
    breakGit();
    const run = host.runCheck({}, root);
    expect(run.code).toBe(1);
    expect(run.stderr).toBe('');
    const lines = run.stdout.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^repository\.git \.: git ls-files exited 128: /u);
    expect(lines[1]).toBe(`fail: system-state, ${String(codeRules.length)} rules, 1 finding.`);
  });
});

describe('a file the check needs that cannot be read', () => {
  test('a directory where AGENTS.md belongs is one error line and exit 1', () => {
    rmSync(join(root, 'AGENTS.md'));
    mkdirSync(join(root, 'AGENTS.md'));
    expect(host.runCheck({}, root)).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: cannot read AGENTS.md: EISDIR: illegal operation on a directory, read\n`,
    });
  });

  test('a puni.json without read permission is one error line naming it, exit 1', () => {
    chmodSync(join(root, 'puni.json'), 0o000);
    try {
      expect(host.runCheck({}, root)).toEqual({
        code: 1,
        stdout: '',
        stderr: `error: cannot read ${join(root, 'puni.json')}: EACCES: permission denied, open '${join(root, 'puni.json')}'\n`,
      });
    } finally {
      chmodSync(join(root, 'puni.json'), 0o600);
    }
  });
});
