import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
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
import type { DirectoryEntry, FileSystem, PathKind } from '@puni/shared-ports';

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

/** The {@link FileSystem} of this machine, through `node:fs` and `node:os`. */
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
      writeFileSync(path, text);
    },
    remove(path) {
      rmSync(path, { recursive: true });
    },
    makeDirectory(path) {
      mkdirSync(path, { recursive: true });
    },
    makeLink(path, target) {
      symlinkSync(target, path);
    },
  };
}
