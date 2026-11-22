import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { CommandBrief } from '@puni/shared-command';
import { checkoutModule, formatRegistry, indexFile, renderIndex } from '@puni/shared-checkout';
import { recordDirectories, recordKinds } from '@puni/shared-records';
import {
  fixtureRemotes,
  nodeHostModule,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';

/** The command tree fixture repositories are indexed with. */
export const fixtureCommands: readonly CommandBrief[] = [
  { path: 'demo dash', brief: 'Do it.' },
  { path: 'demo burokrat', brief: 'Judge.' },
];

/**
 * Rewrites `wiki/index/index.md` of the git repository at `root` from its sources, read through
 * the checkout resources over this machine.
 *
 * @throws Error when the sources have defects; fixtures are expected to be valid here.
 */
export async function regenerateIndex(root: string): Promise<void> {
  const container = DiBag.createBuilder()
    .withInstalledModules([nodeHostModule, checkoutModule])
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
 * Builds a system-state repository named `demo` at `root` that passes every rule: `puni.json`,
 * entry files, the CI workflow, the root project `workspace`, one project `one`, a generated
 * index, and every file staged in a real git repository.
 */
async function buildStateRepository(root: string): Promise<void> {
  mkdirSync(root);
  writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes));
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
    `# demo\n\nStart at \`wiki/index/index.md\`. History lives in ${fixtureRemotes['system-records']}, checked out as \`../demo-records\`.\n`,
  );
  symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
  writeRepositoryFile(root, 'README.md', '# demo\n\nRules: [AGENTS.md](AGENTS.md).\n');
  writeRepositoryFile(
    root,
    '.github/workflows/ci.yml',
    'on: [push, pull_request]\njobs:\n  gate:\n    steps:\n      - run: bun run gate\n      - run: bun run gate:affected\n',
  );
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
 * (system-records), each passing every rule of its type. `removeFixture` deletes both.
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
