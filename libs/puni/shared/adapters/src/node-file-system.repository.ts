import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import type { DirectoryEntry, FileSystem, PathKind } from '@puni/shared-ports';
import { PathNotAbsolute } from './failures';

interface Described {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

function kindOf(entry: Described): Exclude<PathKind, 'absent'> {
  if (entry.isSymbolicLink()) return 'symlink';
  if (entry.isFile()) return 'file';
  return entry.isDirectory() ? 'directory' : 'other';
}

/** Whether `cause` says nothing is at the path: it is missing, or a path segment is a file. */
function isAbsence(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
  );
}

/** How many bytes {@link readLines} reads at a time. */
const lineChunkBytes = 1 << 20;

/**
 * The lines of the file at `path`, read {@link lineChunkBytes} at a time and decoded as a stream,
 * so a character split between two reads is whole and a line longer than a read is one line. Only
 * the new text of a read is searched for a newline, so a long line costs one pass. The file is
 * closed when the lines are exhausted or abandoned.
 */
function* readLines(path: string): Generator<string> {
  const descriptor = openSync(path, 'r');
  try {
    const chunk = Buffer.alloc(lineChunkBytes);
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    for (;;) {
      const read = readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      const text = decoder.decode(chunk.subarray(0, read), { stream: true });
      const last = text.lastIndexOf('\n');
      if (last === -1) {
        pending += text;
        continue;
      }
      const lines = `${pending}${text.slice(0, last)}`.split('\n');
      pending = text.slice(last + 1);
      yield* lines;
    }
    pending += decoder.decode();
    if (pending !== '') yield pending;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * `path`, which a method changing the file system is given.
 *
 * @throws PathNotAbsolute when it is relative.
 */
function requireAbsolute(path: string): string {
  if (!isAbsolute(path)) throw new PathNotAbsolute({ details: { path } });
  return path;
}

/** Publishes a complete file from a private temporary directory without replacing the target. */
function writeNew(path: string, text: string): void {
  const staging = mkdtempSync(join(dirname(requireAbsolute(path)), '.puni-write-'));
  const temporary = join(staging, 'text');
  try {
    writeFileSync(temporary, text, { mode: 0o600 });
    linkSync(temporary, path);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * The {@link FileSystem} of this machine, through `node:fs` and `node:os`. A relative path to a
 * method that changes the file system throws `PathNotAbsolute`.
 */
export function createNodeFileSystem(): FileSystem {
  return {
    readText: (path) => readFileSync(path, 'utf8'),
    stat(path, links) {
      try {
        return kindOf(links === 'follow' ? statSync(path) : lstatSync(path));
      } catch (cause) {
        if (isAbsence(cause)) return 'absent';
        throw cause;
      }
    },
    exists: (path) => existsSync(path),
    readLines,
    readModifiedTime: (path) => statSync(path).mtime,
    homeDirectory: () => homedir(),
    readLink: (path) => readlinkSync(path),
    list: (path): DirectoryEntry[] =>
      readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        kind: kindOf(entry),
      })),
    write(path, text) {
      writeFileSync(requireAbsolute(path), text);
    },
    writeNew,
    remove(path) {
      rmSync(requireAbsolute(path), { recursive: true });
    },
    makeDirectory(path) {
      mkdirSync(requireAbsolute(path), { recursive: true });
    },
    makeLink(path, target) {
      symlinkSync(target, requireAbsolute(path));
    },
  };
}
