import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import type { CommandBrief } from '@puni/shared-command';
import {
  allReposKey,
  checkoutModule,
  indexFile,
  renderIndex,
  type RepositoryType,
  repositoryTypes,
  thisRepoTypeKey,
} from '@puni/shared-checkout';
import { recordDirectories, recordKinds } from '@puni/shared-records';
import { DiBag } from 'di-bag';
import { nodeHost } from './node-host';

/** The command tree fixture repositories are indexed with. */
export const fixtureCommands: readonly CommandBrief[] = [
  { path: 'demo dash', brief: 'Do it.' },
  { path: 'demo burokrat', brief: 'Judge.' },
];

/** Writes `content` at `path` under `root`, creating parent directories. */
export function writeRepositoryFile(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** Project metadata as a fixture writes it; an undefined field is left out of the JSON. */
export interface FixtureMetadata {
  readonly readWhen?: string | undefined;
  readonly readFirst?: string | undefined;
}

/** Writes a `project.json` with `metadata`, and a `src/index.ts` for `readFirst` to name. */
export function writeProject(
  root: string,
  directory: string,
  name: string,
  metadata: FixtureMetadata,
): void {
  writeRepositoryFile(root, `${directory}/project.json`, JSON.stringify({ name, metadata }));
  writeRepositoryFile(root, `${directory}/src/index.ts`, 'export {};\n');
}

/**
 * Rewrites `wiki/index/index.md` of the git repository at `root` from its sources, read through
 * the checkout resources over this machine.
 *
 * @throws Error when the sources have defects; fixtures are expected to be valid here.
 */
export async function regenerateIndex(root: string): Promise<void> {
  const container = DiBag.createBuilder()
    .withInstalledModules([checkoutModule])
    .withServices(nodeHost())
    .buildContainer();
  try {
    const files = container.resolve('checkoutFiles').open(root);
    const sources = container.resolve('checkoutWikiIndex').readSources(files);
    if (sources.defects.length > 0)
      throw new Error(`fixture defects: ${JSON.stringify(sources.defects)}`);
    const rendered = renderIndex(sources.entries, fixtureCommands).get(indexFile);
    if (rendered === undefined) throw new Error(`${indexFile} was not rendered`);
    writeRepositoryFile(root, indexFile, rendered);
  } finally {
    await container.close();
  }
}

/**
 * Runs git in `root`.
 *
 * @throws Error when git exits non-zero.
 */
export function runGit(root: string, args: readonly string[]): void {
  const child = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
}

/** The remote URL of each fixture repository; their last segments name the checkouts. */
export const fixtureRemotes: Readonly<Record<RepositoryType, string>> = {
  'system-state': 'https://github.com/acme/demo',
  'system-records': 'https://github.com/acme/demo-records',
};

/** The text of a valid `puni.json` for the fixture repository of `thisType`. */
export function formatFixtureRegistry(thisType: RepositoryType): string {
  return JSON.stringify({
    [thisRepoTypeKey]: thisType,
    [allReposKey]: repositoryTypes.map((type) => ({
      type,
      remote: { type: 'github', url: fixtureRemotes[type] },
    })),
  });
}

/**
 * Builds a system-state repository named `demo` at `root` that passes every rule: `puni.json`,
 * entry files, the root project `workspace`, one project `one`, a generated index, and every
 * file staged in a real git repository.
 */
async function buildStateRepository(root: string): Promise<void> {
  mkdirSync(root);
  writeRepositoryFile(root, 'puni.json', formatFixtureRegistry('system-state'));
  writeRepositoryFile(root, 'project.json', JSON.stringify({ name: 'workspace' }));
  writeRepositoryFile(root, 'package.json', JSON.stringify({ name: 'demo' }));
  writeProject(root, 'apps/one', 'one', {
    readWhen: 'changing the one app',
    readFirst: 'src/index.ts',
  });
  mkdirSync(join(root, 'libs'));
  writeRepositoryFile(
    root,
    'AGENTS.md',
    '# demo\n\nStart at `wiki/index/index.md`. History lives in `../demo-records`.\n',
  );
  symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
  writeRepositoryFile(root, 'README.md', '# demo\n\nRules: [AGENTS.md](AGENTS.md).\n');
  runGit(root, ['init', '-q']);
  await regenerateIndex(root);
  runGit(root, ['add', '-A']);
}

/**
 * Builds a records repository at `root` that passes every records rule: `AGENTS.md`, the
 * `CLAUDE.md` symlink, and two valid records, the second superseding the first, in a fresh git
 * repository with nothing staged. It holds no `puni.json`: the system-state repository registers
 * it.
 */
function buildRecordsRepository(root: string): void {
  mkdirSync(root);
  writeRepositoryFile(root, 'AGENTS.md', '# demo records\n\nSee [the plans](nav/plans).\n');
  symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
  writeRecord(
    root,
    supersededRecord,
    describeRecord(supersededRecord, { 'superseded-by': supersedingRecord }),
  );
  writeRecord(
    root,
    supersedingRecord,
    describeRecord(supersedingRecord, { supersedes: supersededRecord }),
  );
  mkdirSync(join(root, 'dash/anything/deep'), { recursive: true });
  writeRepositoryFile(root, 'dash/anything/deep/notes.txt', 'free form');
  runGit(root, ['init', '-q']);
}

/** A fixture project: a system-state repository and its records repository beside it. */
export interface RepositoryPair {
  readonly state: string;
  readonly records: string;
}

/**
 * A fresh pair in one temporary directory: `demo` (system-state) and `demo-records`
 * (system-records), each passing every rule of its type. {@link removeFixture} deletes both.
 */
export async function makeRepositoryPair(): Promise<RepositoryPair> {
  const parent = mkdtempSync(join(tmpdir(), 'puni-pair-'));
  const pair = { state: join(parent, 'demo'), records: join(parent, 'demo-records') };
  await buildStateRepository(pair.state);
  buildRecordsRepository(pair.records);
  return pair;
}

/** The system-state repository of a fresh {@link makeRepositoryPair}. */
export async function makeRepository(): Promise<string> {
  return (await makeRepositoryPair()).state;
}

/** The records repository of a fresh {@link makeRepositoryPair}. */
export async function makeRecordsRepository(): Promise<string> {
  return (await makeRepositoryPair()).records;
}

/** Deletes the pair holding `root`, a repository from {@link makeRepositoryPair}. */
export function removeFixture(root: string): void {
  rmSync(dirname(root), { recursive: true, force: true });
}

/** Front matter for a fixture record: every required key, valid for `path`, then `extra`. */
export function describeRecord(
  path: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const kind = recordKinds.find((candidate) => path.startsWith(`${recordDirectories[candidate]}/`));
  if (kind === undefined) throw new Error(`${path} is not in a kind directory`);
  return {
    kind,
    title: 'A fixture record',
    date: posix.basename(path).slice(0, 10),
    commit: 'abc1234',
    topics: 'fixtures, records',
    summary: 'A record the tests build.',
    ...extra,
  };
}

/** Writes a record at `path` whose front matter holds `fields` in order, then a body. */
export function writeRecord(
  root: string,
  path: string,
  fields: Readonly<Record<string, string>>,
): void {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  writeRepositoryFile(root, path, ['---', ...lines, '---', '', 'Body.', ''].join('\n'));
}

/** The fixture records repository's first record, superseded by {@link supersedingRecord}. */
export const supersededRecord = 'nav/plans/2031-04-05-first-plan.md';

/** The fixture records repository's second record, which supersedes the first. */
export const supersedingRecord = 'nav/plans/2031-04-06-second-plan.md';
