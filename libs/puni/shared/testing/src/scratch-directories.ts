import { afterAll, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  ScratchPrefixRefused,
  ScratchRemovalRefused,
  TemporaryDirectoryUnresolved,
} from './failures';

/** The name `mkdtemp` gives a scratch root, `puni-test-<pid>-XXXXXX`; the group is the pid. */
const scratchRootName = /^puni-test-(\d+)-[A-Za-z0-9]{6}$/u;

/** `os.tmpdir()` resolved by the first call that succeeded; a later `TMPDIR` is not read. */
let resolvedTemporaryDirectory: string | undefined;

/**
 * The resolved operating-system temporary directory, read from `os.tmpdir()` once per process.
 *
 * @throws TemporaryDirectoryUnresolved when it is relative (a `TMPDIR` of `.` names the working
 *   directory), does not exist or cannot be resolved; nothing is remembered then.
 */
function resolveTemporaryDirectory(): string {
  if (resolvedTemporaryDirectory !== undefined) return resolvedTemporaryDirectory;
  const temporaryDirectory = tmpdir();
  if (!isAbsolute(temporaryDirectory)) {
    const details = { temporaryDirectory, reason: 'it is not an absolute path' };
    throw new TemporaryDirectoryUnresolved({ details });
  }
  try {
    resolvedTemporaryDirectory = realpathSync(temporaryDirectory);
  } catch (cause) {
    const details = { temporaryDirectory, reason: 'it does not exist or cannot be read' };
    throw new TemporaryDirectoryUnresolved({ details, cause });
  }
  return resolvedTemporaryDirectory;
}

/**
 * `path` with the symbolic links of its deepest existing ancestor resolved and the missing
 * segments appended, so a path not yet created, or already removed, is judged where it would be.
 */
function resolveThroughDeepestExistingAncestor(path: string): string {
  const missingSegments: string[] = [];
  let deepestExistingAncestor = path;
  while (!existsSync(deepestExistingAncestor)) {
    missingSegments.unshift(basename(deepestExistingAncestor));
    deepestExistingAncestor = dirname(deepestExistingAncestor);
  }
  return join(realpathSync(deepestExistingAncestor), ...missingSegments);
}

/**
 * The absolute `path` with `..` applied and its parent's symbolic links followed, its final
 * component kept as written: a final symbolic link is judged, and removed, as the link itself,
 * since `rmSync` never follows it.
 */
function resolveParentKeepingFinalComponent(path: string): string {
  const lexical = resolve(path);
  const parent = dirname(lexical);
  if (parent === lexical) return lexical;
  return join(resolveThroughDeepestExistingAncestor(parent), basename(lexical));
}

/** The segments of `resolved` below `temporaryDirectory`, or `undefined` when it is not below. */
function listSegmentsBelow(resolved: string, temporaryDirectory: string): string[] | undefined {
  if (!resolved.startsWith(`${temporaryDirectory}${sep}`)) return undefined;
  return resolved.slice(temporaryDirectory.length + 1).split(sep);
}

/**
 * The guard every removal of fixture contents passes through: returns `path` resolved (its
 * parent's symbolic links followed, its final component kept) when it lies strictly below this
 * process's scratch root, a `puni-test-<pid>-XXXXXX` directory directly in the resolved
 * `os.tmpdir()`. A checkout or worktree elsewhere in the temporary directory is never removable.
 *
 * @throws ScratchRemovalRefused when `path` is empty or relative (`.` included), or resolves
 *   anywhere but strictly below such a root of this process.
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
export function resolveRemovableScratchPath(path: string): string {
  const refuse = (reason: string) => new ScratchRemovalRefused({ details: { path, reason } });
  if (!isAbsolute(path)) throw refuse('it is not an absolute path');
  const temporaryDirectory = resolveTemporaryDirectory();
  const resolved = resolveParentKeepingFinalComponent(path);
  const [rootName = '', ...below] = listSegmentsBelow(resolved, temporaryDirectory) ?? [];
  if (below.length === 0 || scratchRootName.exec(rootName)?.[1] !== String(process.pid)) {
    throw refuse(
      `it resolves to ${resolved}, not strictly below a puni-test-${String(process.pid)}- scratch root in ${temporaryDirectory}`,
    );
  }
  return resolved;
}

/**
 * Removes `path` and everything below it after {@link resolveRemovableScratchPath} accepts it;
 * a final symbolic link is removed, never its target, and a path already gone is not an error.
 *
 * @throws ScratchRemovalRefused when the guard refuses `path`.
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
export function removeScratchPath(path: string): void {
  rmSync(resolveRemovableScratchPath(path), { recursive: true, force: true });
}

/**
 * Whether a process with id `pid` exists: signal 0 checks without sending; `EPERM` means it
 * exists under another user.
 *
 * @throws Error any other failure of the check.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause) {
      if (cause.code === 'ESRCH') return false;
      if (cause.code === 'EPERM') return true;
    }
    throw cause;
  }
}

/**
 * Removes the whole scratch root at `path`: one directly in the temporary directory, named for
 * this process or for a process that no longer exists.
 *
 * @throws ScratchRemovalRefused when `path` is anything else.
 */
function removeScratchRoot(path: string): void {
  const temporaryDirectory = resolveTemporaryDirectory();
  const resolved = isAbsolute(path) ? resolveParentKeepingFinalComponent(path) : path;
  const segments = listSegmentsBelow(resolved, temporaryDirectory) ?? [];
  const pid = segments.length === 1 ? scratchRootName.exec(segments[0] ?? '')?.[1] : undefined;
  if (pid === undefined || (Number(pid) !== process.pid && isProcessAlive(Number(pid)))) {
    const reason = `it is not a scratch root of this process or of a process that has ended, directly in ${temporaryDirectory}`;
    throw new ScratchRemovalRefused({ details: { path, reason } });
  }
  rmSync(resolved, { recursive: true, force: true });
}

let staleScratchRootsSwept = false;

/**
 * Once per process, removes every scratch root directly in the temporary directory whose process
 * has ended: what a killed run, `--bail` or `process.exit` in a test left behind.
 */
function sweepStaleScratchRoots(temporaryDirectory: string): void {
  if (staleScratchRootsSwept) return;
  staleScratchRootsSwept = true;
  for (const entry of readdirSync(temporaryDirectory, { withFileTypes: true })) {
    const pid = scratchRootName.exec(entry.name)?.[1];
    if (pid === undefined || !entry.isDirectory() || Number(pid) === process.pid) continue;
    if (!isProcessAlive(Number(pid))) removeScratchRoot(join(temporaryDirectory, entry.name));
  }
}

/** This process's scratch root while any owned directory lives in it. */
let scratchRoot: string | undefined;

/** How many owned directories, across every owner in this process, exist below the root. */
let ownedDirectoryCount = 0;

/**
 * This process's scratch root, `<os.tmpdir()>/puni-test-<pid>-XXXXXX`, created on first use after
 * stale roots are swept. The root lives only while an owned directory does: the owner removing
 * the last one removes the root, and a later directory creates a new one. Bun's test runner does
 * not run `process.on('exit')` handlers, and signal handlers would delay an interrupt until the
 * runner yields, so what an ended run leaves is swept by the next one instead.
 *
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
function acquireScratchRoot(): string {
  if (scratchRoot !== undefined) return scratchRoot;
  const temporaryDirectory = resolveTemporaryDirectory();
  sweepStaleScratchRoots(temporaryDirectory);
  scratchRoot = mkdtempSync(join(temporaryDirectory, `puni-test-${String(process.pid)}-`));
  return scratchRoot;
}

/**
 * Creates fixture directories below this process's scratch root and removes exactly those, so
 * a teardown after a setup that failed before creating anything removes nothing. One owner
 * serves the tests of one file in turn; tests running concurrently must not share one.
 */
export interface ScratchDirectoryOwner {
  /**
   * Creates `<scratch root>/<prefix>XXXXXX`, records it as owned, and returns its absolute path.
   * When it throws, nothing is recorded and no root is left that no directory needs.
   *
   * @throws ScratchPrefixRefused when `prefix` holds `/`, `\` or `..`.
   * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
   * @throws Error what `mkdtempSync` throws, such as `ENAMETOOLONG`.
   */
  createDirectory(prefix: string): string;
  /**
   * Removes, newest first, every directory this owner created and has not yet removed, then the
   * scratch root when no owner holds a directory in it any more.
   *
   * @throws ScratchRemovalRefused when the guard refuses one; it and older ones stay recorded.
   * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
   * @throws Error what `rmSync` throws, such as `EACCES` below a directory a test locked.
   */
  removeCreatedDirectories(): void;
}

/** A {@link ScratchDirectoryOwner} whose removal is left to the caller. */
export function createScratchDirectoryOwner(): ScratchDirectoryOwner {
  const createdDirectories: string[] = [];
  return {
    createDirectory(prefix) {
      if (/[/\\]|\.\./u.test(prefix)) throw new ScratchPrefixRefused({ details: { prefix } });
      const root = acquireScratchRoot();
      let directory: string;
      try {
        directory = mkdtempSync(join(root, prefix));
      } catch (cause) {
        if (ownedDirectoryCount === 0) {
          removeScratchRoot(root);
          scratchRoot = undefined;
        }
        throw cause;
      }
      createdDirectories.push(directory);
      ownedDirectoryCount += 1;
      return directory;
    },
    removeCreatedDirectories() {
      for (
        let directory = createdDirectories.at(-1);
        directory !== undefined;
        directory = createdDirectories.at(-1)
      ) {
        removeScratchPath(directory);
        createdDirectories.pop();
        ownedDirectoryCount -= 1;
      }
      if (ownedDirectoryCount === 0 && scratchRoot !== undefined) {
        removeScratchRoot(scratchRoot);
        scratchRoot = undefined;
      }
    },
  };
}

/**
 * Registers an `afterEach` that removes every directory the returned owner created during the
 * test, and returns that owner. Call it once at the top level of a test file.
 */
export function removeScratchDirectoriesAfterEach(): ScratchDirectoryOwner {
  const owner = createScratchDirectoryOwner();
  afterEach(() => {
    owner.removeCreatedDirectories();
  });
  return owner;
}

/**
 * Registers an `afterAll` that removes every directory the returned owner created while the file
 * ran, and returns that owner. Call it once at the top level of a test file, and create its
 * directories in `beforeAll` or tests, never while tests are collected, so a filtered run that
 * selects none of them creates nothing.
 */
export function removeScratchDirectoriesAfterAll(): ScratchDirectoryOwner {
  const owner = createScratchDirectoryOwner();
  afterAll(() => {
    owner.removeCreatedDirectories();
  });
  return owner;
}
