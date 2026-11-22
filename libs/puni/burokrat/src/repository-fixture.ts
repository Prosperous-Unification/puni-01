import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { recordDirectories, recordKinds } from './records-schema';
import { indexFile, readIndexSources, renderIndex, type CommandBrief } from './wiki/wiki-index';

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
 * Rewrites `wiki/index/index.md` from the repository's sources.
 *
 * @throws Error when the sources have defects; fixtures are expected to be valid here.
 */
export function regenerateIndex(root: string): void {
  const sources = readIndexSources(root);
  if (sources.defects.length > 0)
    throw new Error(`fixture defects: ${JSON.stringify(sources.defects)}`);
  const rendered = renderIndex(sources.entries, fixtureCommands).get(indexFile);
  if (rendered === undefined) throw new Error(`${indexFile} was not rendered`);
  writeRepositoryFile(root, indexFile, rendered);
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

/**
 * A fresh temporary repository named `demo` that passes every rule: entry files, one project,
 * a generated index, and every file staged in a real git repository.
 */
export function makeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'puni-burokrat-'));
  writeRepositoryFile(root, 'puni.json', JSON.stringify({ kind: 'code' }));
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
  regenerateIndex(root);
  runGit(root, ['init', '-q']);
  runGit(root, ['add', '-A']);
  return root;
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

/**
 * A fresh temporary records repository that passes every records rule: `puni.json`, `AGENTS.md`,
 * the `CLAUDE.md` symlink, and two valid records, the second superseding the first.
 */
export function makeRecordsRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'puni-records-'));
  writeRepositoryFile(root, 'puni.json', JSON.stringify({ kind: 'records' }));
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
  return root;
}

/** The fixture records repository's first record, superseded by {@link supersedingRecord}. */
export const supersededRecord = 'nav/plans/2031-04-05-first-plan.md';

/** The fixture records repository's second record, which supersedes the first. */
export const supersedingRecord = 'nav/plans/2031-04-06-second-plan.md';
