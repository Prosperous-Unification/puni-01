import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/** Writes a `project.json`; `metadata` is omitted when `readWhen` is undefined. */
export function writeProject(
  root: string,
  directory: string,
  name: string,
  readWhen?: string,
): void {
  const metadata = readWhen === undefined ? {} : { metadata: { readWhen } };
  writeRepositoryFile(root, `${directory}/project.json`, JSON.stringify({ name, ...metadata }));
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
  writeRepositoryFile(root, 'nx.json', '{}');
  writeRepositoryFile(root, 'package.json', JSON.stringify({ name: 'demo' }));
  writeProject(root, 'apps/one', 'one', 'changing the one app');
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
