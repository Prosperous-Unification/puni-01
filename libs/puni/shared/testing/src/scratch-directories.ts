import { afterAll, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { ScratchRemovalRefused, TemporaryDirectoryUnresolved } from './failures';

/**
 * The resolved operating-system temporary directory, read from `os.tmpdir()` on every call so a
 * changed `TMPDIR` is honoured.
 *
 * @throws TemporaryDirectoryUnresolved when it does not exist or cannot be resolved.
 */
function resolveTemporaryDirectory(): string {
  const temporaryDirectory = tmpdir();
  try {
    return realpathSync(temporaryDirectory);
  } catch (cause) {
    throw new TemporaryDirectoryUnresolved({ details: { temporaryDirectory }, cause });
  }
}

/**
 * `path` with the symbolic links of its deepest existing ancestor resolved and the missing rest
 * appended, so a path not yet created, or already removed, is still judged where it would land.
 */
function resolveThroughExistingAncestor(path: string): string {
  const missing: string[] = [];
  let existing = path;
  while (!existsSync(existing)) {
    missing.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync(existing), ...missing);
}

/**
 * The guard every removal the test helpers make passes through: returns `path` resolved, with
 * its symbolic links followed, when it lies strictly below the resolved `os.tmpdir()`.
 *
 * @throws ScratchRemovalRefused when `path` is empty or relative (`.` included), or resolves,
 *   `..` segments and symbolic links followed, to the temporary directory itself or outside it.
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
export function resolveRemovableScratchPath(path: string): string {
  const refuse = (reason: string) => new ScratchRemovalRefused({ details: { path, reason } });
  if (!isAbsolute(path)) throw refuse('it is not an absolute path');
  const temporaryDirectory = resolveTemporaryDirectory();
  const resolved = resolveThroughExistingAncestor(resolve(path));
  if (!resolved.startsWith(`${temporaryDirectory}${sep}`)) {
    throw refuse(`it resolves to ${resolved}, not strictly below ${temporaryDirectory}`);
  }
  return resolved;
}

/**
 * Removes `path` and everything below it after {@link resolveRemovableScratchPath} accepts it;
 * a path already gone is not an error.
 *
 * @throws ScratchRemovalRefused when the guard refuses `path`.
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
export function removeScratchPath(path: string): void {
  rmSync(resolveRemovableScratchPath(path), { recursive: true, force: true });
}

/** This process's scratch root while any owned directory lives in it. */
let scratchRoot: string | undefined;

/** How many owned directories, across every owner in this process, exist below the root. */
let ownedDirectoryCount = 0;

let signalRemovalInstalled = false;

/** Removes the scratch root, if there is one, through the guard. */
function removeScratchRoot(): void {
  if (scratchRoot === undefined) return;
  removeScratchPath(scratchRoot);
  scratchRoot = undefined;
}

/**
 * Removes the scratch root on `SIGINT` and `SIGTERM`, then raises the same signal again with the
 * handler gone, so the process still ends by that signal and keeps its exit status.
 */
function installSignalRemoval(): void {
  if (signalRemovalInstalled) return;
  signalRemovalInstalled = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      try {
        removeScratchRoot();
      } finally {
        process.kill(process.pid, signal);
      }
    });
  }
}

/**
 * This process's scratch root, `<os.tmpdir()>/puni-test-<pid>-XXXXXX`, created on first use.
 * The root lives only while an owned directory does: the owner removing the last one removes the
 * root, and a later directory creates a new one. Bun's test runner does not run
 * `process.on('exit')` handlers, so the root's lifetime is bound to its owners' hooks instead.
 *
 * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved.
 */
function acquireScratchRoot(): string {
  if (scratchRoot !== undefined) return scratchRoot;
  const temporaryDirectory = resolveTemporaryDirectory();
  scratchRoot = mkdtempSync(join(temporaryDirectory, `puni-test-${String(process.pid)}-`));
  installSignalRemoval();
  return scratchRoot;
}

/**
 * Creates fixture directories below this process's scratch root and removes exactly those, so
 * a teardown after a setup that failed before creating anything removes nothing.
 */
export interface ScratchDirectoryOwner {
  /**
   * Creates `<scratch root>/<prefix>XXXXXX`, records it as owned, and returns its absolute path.
   *
   * @throws TemporaryDirectoryUnresolved when the temporary directory cannot be resolved;
   *   nothing is recorded.
   */
  createDirectory(prefix: string): string;
  /**
   * Removes, newest first, every directory this owner created and has not yet removed, then the
   * scratch root when no owner holds a directory in it any more.
   *
   * @throws ScratchRemovalRefused when the guard refuses one; it and older ones stay recorded.
   */
  removeCreatedDirectories(): void;
}

/** A {@link ScratchDirectoryOwner} whose removal is left to the caller. */
export function createScratchDirectoryOwner(): ScratchDirectoryOwner {
  const created: string[] = [];
  return {
    createDirectory(prefix) {
      const root = acquireScratchRoot();
      let directory: string;
      try {
        directory = mkdtempSync(join(root, prefix));
      } catch (cause) {
        if (ownedDirectoryCount === 0) removeScratchRoot();
        throw cause;
      }
      created.push(directory);
      ownedDirectoryCount += 1;
      return directory;
    },
    removeCreatedDirectories() {
      for (let directory = created.at(-1); directory !== undefined; directory = created.at(-1)) {
        removeScratchPath(directory);
        created.pop();
        ownedDirectoryCount -= 1;
      }
      if (ownedDirectoryCount === 0) removeScratchRoot();
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
 * ran, collection included, and returns that owner. Call it once at the top level of a test file.
 */
export function removeScratchDirectoriesAfterAll(): ScratchDirectoryOwner {
  const owner = createScratchDirectoryOwner();
  afterAll(() => {
    owner.removeCreatedDirectories();
  });
  return owner;
}
