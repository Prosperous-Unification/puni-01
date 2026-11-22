import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

/** The {@link FileSystem} of this machine, through `node:fs`. */
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
  };
}
