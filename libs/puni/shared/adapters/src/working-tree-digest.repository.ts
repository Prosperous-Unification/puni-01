import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProcessRunner, WorkingTreeDigest } from '@puni/shared-ports';

function hashFile(path: string, buffer: Buffer): string {
  const hash = createHash('sha256');
  const descriptor = openSync(path, 'r');
  try {
    for (let read = readSync(descriptor, buffer); read > 0; read = readSync(descriptor, buffer)) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

/** Hashes the raw paths, modes, and contents of tracked and visible untracked working-tree files. */
export function createWorkingTreeDigest({
  processRunner,
}: {
  readonly processRunner: ProcessRunner;
}): WorkingTreeDigest {
  return {
    read(root, commit) {
      const listed = processRunner.run(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { cwd: root },
      );
      if (listed.kind === 'unstarted') throw new Error(`git ls-files: ${listed.reason}`);
      if (listed.exitCode !== 0) throw new Error(`git ls-files: ${listed.stderr.trim()}`);
      const paths = [...new Set(listed.stdout.split('\0').filter(Boolean))].sort();
      const directories = new Map<string, boolean>([['.', true]]);
      const buffer = Buffer.alloc(64 * 1024);
      const digest = createHash('sha256').update(commit);

      function isDirectory(path: string): boolean {
        const known = directories.get(path);
        if (known !== undefined) return known;
        const directory =
          isDirectory(dirname(path)) &&
          lstatSync(join(root, path), { throwIfNoEntry: false })?.isDirectory() === true;
        directories.set(path, directory);
        return directory;
      }

      for (const path of paths) {
        const absolute = join(root, path);
        const info = isDirectory(dirname(path))
          ? lstatSync(absolute, { throwIfNoEntry: false })
          : undefined;
        if (info === undefined) {
          digest.update(JSON.stringify([path, 'absent']));
        } else if (info.isSymbolicLink()) {
          const target = readlinkSync(absolute, { encoding: 'buffer' });
          digest.update(
            JSON.stringify([path, info.mode, createHash('sha256').update(target).digest('hex')]),
          );
        } else if (info.isFile()) {
          digest.update(JSON.stringify([path, info.mode, hashFile(absolute, buffer)]));
        } else if (info.isDirectory() && paths.some((child) => child.startsWith(`${path}/`))) {
          digest.update(JSON.stringify([path, info.mode, 'directory']));
        } else {
          throw new Error(
            `cannot fingerprint working-tree entry ${path}; review the committed tree instead`,
          );
        }
      }
      return digest.digest('hex');
    },
  };
}
