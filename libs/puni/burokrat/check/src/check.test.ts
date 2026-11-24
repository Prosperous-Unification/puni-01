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
import { formatRegistry, indexWordBudget } from '@puni/shared-checkout';
import { nxPlacementHint, readFirstRemedy, scopeRemedy } from '@puni/shared-nx';
import {
  fixtureRemotes,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { agentsWordBudget, pageWordBudget, readmeWordBudget } from './budgets';
import { digestRulesSection } from './agents-rules';
import {
  type CheckHost,
  dropRemedies,
  fixtureAgentsKeepRules,
  fixtureRuleSets,
  type Judged,
  openCheckHost,
} from './check.test-host';
import { appliesAt, listEveryRule, type Rule } from './finding';
import { checkRules, codeRules, latestRulesEpoch } from './rule-set.rule';
import {
  agentsExists,
  agentsNamesIndex,
  agentsNamesMap,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './rules/entry.rule';
import { confineRecordsName, forbidDates } from './rules/history.rule';
import {
  limitIndexWords,
  requirePurposes,
  requireReadFirst,
  requireReadWhen,
  requireScope,
  requireSection,
} from './rules/index.rule';
import { resolveLinks } from './rules/links.rule';
import { judgeDocSymbols, limitPageWords } from './rules/wiki.rule';
import {
  judgeDocCommands,
  judgeDocPaths,
  judgeMarkdownCommands,
  judgeMarkdownPaths,
} from './rules/docs.rule';
import { judgeDocLinks, judgeDocReferences, judgeDocSpans } from './rules/references.rule';
import { requireProjectTargets } from './rules/project.rule';
import { forbidFileHeaders } from './rules/code.rule';
import { forbidPlaintextSecrets, forbidStateAddresses } from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate } from './rules/workspace.rule';
import { credentialLookalikes, credentialSamples, forbiddenAddress } from './secrets.test-host';
import {
  fixtureAgentsRules,
  formatFixtureRegistry,
  makeRepository,
} from './repository-pair.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(() => {
  root = makeRepository(scratchDirectories);
  writeRepositoryFile(root, 'puni.json', formatFixtureRegistry(latestRulesEpoch));
});

/** The system-state rules that apply at the fixture's pin, the latest epoch. */
const pinnedCodeRules = codeRules.filter(({ rule }) => appliesAt(rule, latestRulesEpoch));

function judge(rule: Rule): Judged[] {
  return dropRemedies(host.judge(rule, root));
}

function words(count: number): string {
  return `${'word '.repeat(count - 4)}puni burokrat wiki map\n`;
}

const recordsName = ['demo', 'records'].join('-');

/** Replaces the one `from` in the fixture's `AGENTS.md` with `to`. */
function editAgents(from: string, to: string): void {
  const path = join(root, 'AGENTS.md');
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`AGENTS.md does not hold ${from}`);
  writeFileSync(path, text.replace(from, to));
}

/** Rewrites the fixture's `puni.json` with `purposes` as its map. */
function writePurposes(purposes: readonly (readonly [string, string])[]): void {
  writeRepositoryFile(
    root,
    'puni.json',
    formatRegistry('system-state', fixtureRemotes, latestRulesEpoch, new Map(purposes)),
  );
}

/** The words the map of `app` prints once {@link writeCrowdedPartition} fills it. */
const crowdedWords = 459;

/** Twenty projects in the partition `index`, each with a "Read when" of twenty words. */
function writeCrowdedPartition(index: readonly string[]): void {
  for (const at of Array.from({ length: 20 }, (_, count) => String(count))) {
    writeProject(root, `libs/many${at}`, `many${at}`, {
      readWhen: `changing ${'many '.repeat(18)}${at}`,
      readFirst: 'src/index.ts',
      index,
    });
  }
}

/** `count` pages directly in `directory`, each with a "Read when" of twenty words. */
function writePages(directory: string, count: number): void {
  for (const at of Array.from({ length: count }, (_, index) => String(index))) {
    writeRepositoryFile(
      root,
      `${directory}/page${at}.md`,
      `---\ntitle: Page ${at}\nread-when: reading ${'page '.repeat(18)}${at}\n---\n`,
    );
  }
}

/**
 * `count` partitions `<prefix><n>`, each holding one project and given a purpose of twenty words,
 * beside the fixture's `app`.
 */
function writeChildren(prefix: string, count: number): void {
  const purposes: [string, string][] = [['app', 'changing the app']];
  for (const at of Array.from({ length: count }, (_, index) => String(index))) {
    const partition = `${prefix}${at}`;
    writeProject(root, `libs/kid${at}`, `kid${at}`, {
      readWhen: `changing kid ${at}`,
      readFirst: 'src/index.ts',
      index: partition.split('/'),
    });
    purposes.push([partition, `changing ${'kid '.repeat(18)}${at}`]);
  }
  writePurposes(purposes);
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
    'AGENTS.md not naming the index, up to epoch 2',
    agentsNamesIndex,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', '# demo\n\nRun `puni burokrat wiki map`.\n');
    },
    { rule: 'agents.index', path: 'AGENTS.md', message: 'does not name wiki/index/index.md' },
  ],
  [
    'AGENTS.md not naming the map command',
    agentsNamesMap,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', '# demo\n\nRead the old index.\n');
    },
    { rule: 'agents.index', path: 'AGENTS.md', message: 'does not name puni burokrat wiki map' },
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
    'a partition the map shows without a purpose',
    requirePurposes,
    () => {
      writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes, 1));
    },
    {
      rule: 'index.purpose',
      path: 'puni.json',
      message: 'map has no purpose for partition app, which the map shows',
      remedy: 'add "app": "<the task an agent comes to app for>" to the map of puni.json',
    },
  ],
  [
    'a purpose for a partition where no project is placed',
    requirePurposes,
    () => {
      writePurposes([
        ['app', 'changing the app'],
        ['dash/ops', 'reaching a node'],
      ]);
    },
    {
      rule: 'index.purpose',
      path: 'puni.json',
      message: 'map gives a purpose for partition dash/ops, where no project is placed',
      remedy: 'remove "dash/ops" from the map of puni.json, or place a project there',
    },
  ],
  [
    'a purpose that does not complete "Read this when"',
    requirePurposes,
    () => {
      writePurposes([['app', 'The app.']]);
    },
    {
      rule: 'index.purpose',
      path: 'puni.json',
      message: 'map.app must start with a lower-case letter, must not end with a full stop',
      remedy:
        'make the purpose of app a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words',
    },
  ],
  [
    'a partition whose projects do not fit the budget',
    limitIndexWords,
    () => {
      writeCrowdedPartition(['app']);
    },
    {
      rule: 'index.words',
      path: 'puni.json',
      message: `the map of partition app (\`puni burokrat wiki map app\`) prints ${String(crowdedWords)} words; at most ${String(indexWordBudget)}`,
      remedy: `place some of its projects in a partition below app (${nxPlacementHint}) and give that partition a purpose in the map of puni.json, or shorten their read-when`,
    },
  ],
  [
    'a partition whose child partitions do not fit the budget',
    limitIndexWords,
    () => {
      writeChildren('app/c', 20);
    },
    {
      rule: 'index.words',
      path: 'puni.json',
      message: `the map of partition app (\`puni burokrat wiki map app\`) prints 541 words; at most ${String(indexWordBudget)}`,
      remedy:
        'shorten the purposes of the partitions below app in the map of puni.json, or group them under an intermediate partition',
    },
  ],
  [
    'a root whose top-level partitions do not fit the budget, run through a puni script',
    limitIndexWords,
    () => {
      writeRepositoryFile(root, 'package.json', JSON.stringify({ scripts: { puni: 'bun x.ts' } }));
      writeChildren('top', 20);
    },
    {
      rule: 'index.words',
      path: 'wiki',
      message: `the root map (\`bun run puni burokrat wiki map\`) prints 576 words; at most ${String(indexWordBudget)}`,
      remedy:
        'shorten the purposes of the top-level partitions in the map of puni.json, or group them under fewer top-level partitions',
    },
  ],
  [
    'a root whose pages do not fit the budget, its sections collapsed',
    limitIndexWords,
    () => {
      writePages('wiki', 20);
    },
    {
      rule: 'index.words',
      path: 'wiki',
      message: `the root map (\`puni burokrat wiki map\`) prints 477 words; at most ${String(indexWordBudget)}`,
      remedy:
        'shorten the read-when of the pages directly in wiki/, merge them, or move them into a section',
    },
  ],
  [
    'a section whose pages do not fit the budget',
    limitIndexWords,
    () => {
      writePages('wiki/how-to', 20);
    },
    {
      rule: 'index.words',
      path: 'wiki',
      message: `the map of section how-to (\`puni burokrat wiki map how-to\`) prints 476 words; at most ${String(indexWordBudget)}`,
      remedy: 'shorten the read-when of the pages in wiki/how-to/, or merge pages',
    },
  ],
  [
    'a partition named as a wiki section',
    requirePurposes,
    () => {
      writeProject(root, 'libs/con', 'con', {
        readWhen: 'changing con',
        readFirst: 'src/index.ts',
        index: ['concepts'],
      });
      writePurposes([
        ['app', 'changing the app'],
        ['concepts', 'reading concepts'],
      ]);
    },
    {
      rule: 'index.purpose',
      path: 'puni.json',
      message:
        'partition concepts has the name of the wiki section wiki/concepts/, which `wiki map concepts` prints',
      remedy: 'place the projects of concepts in a partition of another name',
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
      remedy: scopeRemedy,
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
      remedy: readFirstRemedy,
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
    'a backticked path that does not exist, up to epoch 3',
    judgeMarkdownPaths,
    () => {
      appendFileSync(join(root, 'README.md'), 'Deploy with `bin/deploy.sh`.\n');
    },
    { rule: 'docs.paths', path: 'README.md', message: 'names the missing path bin/deploy.sh' },
  ],
  [
    'a doc comment naming a path that does not exist',
    judgeDocPaths,
    () => {
      writeRepositoryFile(
        root,
        'libs/x/src/a.ts',
        '/**\n * Runs `bin/deploy.sh`.\n */\nexport const a = 1;\n',
      );
    },
    {
      rule: 'docs.paths',
      path: 'libs/x/src/a.ts',
      message: 'doc comment at line 1 names the missing path bin/deploy.sh',
    },
  ],
  [
    'a link naming a symbol its source file does not declare',
    judgeDocReferences,
    () => {
      writeRepositoryFile(root, 'libs/x/src/a.ts', 'export const parse = 1;\n');
      appendFileSync(
        join(root, 'README.md'),
        'See [`parse`](libs/x/src/a.ts#parse) and [`gone`](libs/x/src/a.ts#gone).\n',
      );
    },
    {
      rule: 'docs.references',
      path: 'README.md',
      message: 'links to libs/x/src/a.ts#gone, but libs/x/src/a.ts declares no gone',
    },
  ],
  [
    'a link with a fragment into a file no source reader reads',
    judgeDocReferences,
    () => {
      writeRepositoryFile(root, 'config/a.json', '{ "key": 1 }\n');
      appendFileSync(join(root, 'README.md'), 'Set [key](config/a.json#key).\n');
    },
    {
      rule: 'docs.references',
      path: 'README.md',
      message:
        'links to config/a.json#key, but no source reader reads a .json file, so the fragment names nothing',
      remedy:
        'drop the #key, or link a file whose symbols a source reader reads (.cjs, .cts, .js, .jsx, .mjs, .mts, .ts, .tsx)',
    },
  ],
  [
    'a symbol in backticks outside a link',
    judgeDocSpans,
    () => {
      writeRepositoryFile(root, 'libs/x/src/a.ts', 'export const parse = 1;\n');
      appendFileSync(
        join(root, 'README.md'),
        'Call `renderIndex()`, [`parse`](libs/x/src/a.ts#parse), `metadata.readWhen` and `CLAUDE.md`.\n',
      );
    },
    {
      rule: 'docs.spans',
      path: 'README.md',
      message: 'names the symbol renderIndex without linking it',
    },
  ],
  [
    'a doc comment linking a name out of scope',
    judgeDocLinks,
    () => {
      writeRepositoryFile(
        root,
        'libs/x/src/a.ts',
        "import { join } from 'node:path';\n\n/** Uses {@link join}, {@link Box.size}, {@link https://github.com/acme}, then {@link gone}. */\nexport const Box = { size: join('a') };\n",
      );
    },
    {
      rule: 'docs.comment-links',
      path: 'libs/x/src/a.ts',
      message: 'doc comment at line 3 links {@link gone}, but gone is not in scope',
    },
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
    'a bun run naming no script, up to epoch 3',
    judgeMarkdownCommands,
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
    'a doc comment naming a command the tree does not hold',
    judgeDocCommands,
    () => {
      writeRepositoryFile(
        root,
        'libs/x/src/a.ts',
        '/** Run `demo burokrat audit`. */\nexport const a = 1;\n',
      );
    },
    {
      rule: 'docs.commands',
      path: 'libs/x/src/a.ts',
      message: 'doc comment at line 1 names no command demo burokrat audit',
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
          message: `rules section digests to ${digestRulesSection(fixtureAgentsRules.replace(from, to))}, not ${digestRulesSection(fixtureAgentsRules)}, the rules in force at epoch ${String(latestRulesEpoch)}`,
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
        'See [the rules](../../AGENTS.md#nowhere).\n',
      );
    },
    {
      rule: 'links.resolve',
      path: 'wiki/ops/deploy.md',
      message:
        'links to ../../AGENTS.md#nowhere, but AGENTS.md has no heading with the anchor #nowhere',
      remedy: 'point the link at a heading of AGENTS.md, or drop the #nowhere',
    },
  ],
  [
    'a backticked path to a heading that does not exist',
    judgeDocPaths,
    () => {
      writeRepositoryFile(root, 'apps/one/NOTES.md', '# Notes\n');
      appendFileSync(join(root, 'README.md'), 'Read `apps/one/NOTES.md#nowhere`.\n');
    },
    {
      rule: 'docs.paths',
      path: 'README.md',
      message:
        'names apps/one/NOTES.md#nowhere, but apps/one/NOTES.md has no heading with the anchor #nowhere',
      remedy: 'name a heading of apps/one/NOTES.md, or drop the fragment',
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
    const everyRule = listEveryRule(checkRules);
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

  test('while the map sources have defects, index.words and unused purposes judge nothing', () => {
    writeCrowdedPartition(['app']);
    writePurposes([
      ['app', 'changing the app'],
      ['dash', 'operating nodes'],
    ]);
    expect(judge(limitIndexWords)).toHaveLength(1);
    expect(judge(requirePurposes)).toHaveLength(1);
    writeProject(root, 'libs/two', 'two', {});
    expect([...judge(limitIndexWords), ...judge(requirePurposes)]).toEqual([]);
  });

  /**
   * Fills `app` to `total` words: its head and the fixture's project hold 19, seventeen projects
   * of twenty-word read-whens 22 each, and one last project the rest.
   */
  function fillApp(total: number): void {
    for (const at of Array.from({ length: 17 }, (_, index) => String(index))) {
      writeProject(root, `libs/pad${at}`, `pad${at}`, {
        readWhen: `changing ${'pad '.repeat(18)}${at}`,
        readFirst: 'src/index.ts',
      });
    }
    writeProject(root, 'libs/last', 'last', {
      readWhen: Array.from({ length: total - 19 - 17 * 22 - 2 }, () => 'w').join(' '),
      readFirst: 'src/index.ts',
    });
  }

  test('a level of exactly the budget passes, one word more is a finding', () => {
    fillApp(indexWordBudget);
    expect(judge(limitIndexWords)).toEqual([]);
    writeProject(root, 'libs/last', 'last', {
      readWhen: 'w w w w w w',
      readFirst: 'src/index.ts',
    });
    expect(judge(limitIndexWords)).toEqual([
      {
        rule: 'index.words',
        path: 'puni.json',
        message: `the map of partition app (\`puni burokrat wiki map app\`) prints ${String(indexWordBudget + 1)} words; at most ${String(indexWordBudget)}`,
      },
    ]);
  });

  test('a partition without a purpose leaves index.words to index.purpose', () => {
    writeCrowdedPartition(['dash']);
    expect(judge(limitIndexWords)).toEqual([]);
    expect(judge(requirePurposes)).toEqual([
      {
        rule: 'index.purpose',
        path: 'puni.json',
        message: 'map has no purpose for partition dash, which the map shows',
      },
    ]);
  });

  test('a repository without nx.json holds no workspace: ci.gate judges nothing', () => {
    rmSync(join(root, 'nx.json'));
    rmSync(join(root, '.github'), { recursive: true });
    expect(judge(requireCiGate)).toEqual([]);
    writeRepositoryFile(root, 'nx.json', '{}');
    expect(judge(requireCiGate)).toEqual([
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
      { path: 'demo burokrat wiki map', brief: 'Map.' },
    ]);
    try {
      appendFileSync(
        join(root, 'README.md'),
        '`demo burokrat check here` `demo burokrat wiki map now` `demo burokrat wiki nope`\n',
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
      printed: `ok: system-state, ${String(pinnedCodeRules.length)} rules, no findings.\n`,
    });
  });

  test('findings print sorted, then a summary, and exit 1', () => {
    rmSync(join(root, 'README.md'));
    writeFileSync(join(root, 'AGENTS.md'), `# demo\n\n${fixtureAgentsRules}`);
    expect(runIn(root)).toEqual({
      code: 1,
      printed: [
        'agents.index AGENTS.md: does not name puni burokrat wiki map; fix: name `puni burokrat wiki map` in AGENTS.md as the command printing the map to read first',
        'agents.records AGENTS.md: does not give the records checkout ../demo-records; fix: write the records repository as https://github.com/acme/demo-records, checked out as `../demo-records`',
        'agents.records AGENTS.md: does not give the records repository URL https://github.com/acme/demo-records; fix: write the records repository as https://github.com/acme/demo-records, checked out as `../demo-records`',
        'readme.exists README.md: is missing; fix: create README.md at the root: what the repository is, for a person arriving',
        `fail: system-state, ${String(pinnedCodeRules.length)} rules, 4 findings.`,
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
      `repository.config puni.json: ${join(root, 'puni.json')} all-repos is []; expected a non-empty array; fix: correct puni.json as the message says: this-repo-type, rules (the rules epoch), all-repos listing every type once, and optionally map (each partition path to its purpose) and keys starting x-\nfail: no repository, 1 finding.\n`,
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
    expect(lines[1]).toBe(
      `fail: system-state, ${String(pinnedCodeRules.length)} rules, 1 finding.`,
    );
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
