import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/**
 * Writes a library `project.json` named `name` with `metadata` and the targets every project
 * carries, a `tsconfig.json` including `src`, and a `src/index.ts` for `readFirst` to name.
 */
export function writeProject(
  root: string,
  directory: string,
  name: string,
  metadata: FixtureMetadata,
): void {
  const run = (command: string) => ({ executor: 'nx:run-commands', options: { command } });
  const targets = {
    test: run('bun test src --timeout=20000'),
    lint: run(`bunx eslint ${directory}/src`),
    typecheck: run(`bunx tsc --noEmit -p ${directory}/tsconfig.json`),
  };
  writeRepositoryFile(
    root,
    `${directory}/project.json`,
    JSON.stringify({ name, projectType: 'library', metadata, targets }),
  );
  writeRepositoryFile(root, `${directory}/tsconfig.json`, JSON.stringify({ include: ['src'] }));
  writeRepositoryFile(root, `${directory}/src/index.ts`, 'export {};\n');
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

/** Deletes the temporary directory holding the fixture repository at `root`, and its peers. */
export function removeFixture(root: string): void {
  rmSync(dirname(root), { recursive: true, force: true });
}
