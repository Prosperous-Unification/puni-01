import { afterAll, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createNodeFileSystem } from '@puni/shared-adapters';
import type { FileSystem } from '@puni/shared-ports';
import { createMemoryFileSystem, type MemoryTree } from './memory-host';

/** The tree every implementation is judged over, by path below its root. */
const tree: MemoryTree = {
  'a.md': 'a',
  link: { symlink: 'a.md' },
  dangling: { symlink: 'gone.md' },
  loop: { symlink: 'loop' },
  empty: { directory: true },
  'deep/b.md': 'b',
};

/** A file system holding {@link tree} below `root`. */
interface Subject {
  readonly fileSystem: FileSystem;
  readonly root: string;
}

const temporaries: string[] = [];

afterAll(() => {
  for (const directory of temporaries) rmSync(directory, { recursive: true, force: true });
});

function writeNodeTree(): Subject {
  const root = mkdtempSync(join(tmpdir(), 'puni-file-system-'));
  temporaries.push(root);
  for (const [path, node] of Object.entries(tree)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (typeof node === 'string') writeFileSync(absolute, node);
    else if ('symlink' in node) symlinkSync(node.symlink, absolute);
    else mkdirSync(absolute);
  }
  return { fileSystem: createNodeFileSystem(), root };
}

function writeMemoryTree(): Subject {
  const root = '/m';
  const rooted = Object.fromEntries(
    Object.entries(tree).map(([path, node]) => [`${root}/${path}`, node]),
  );
  return { fileSystem: createMemoryFileSystem(rooted), root };
}

const subjects: readonly (readonly [string, () => Subject])[] = [
  ['the node adapter', writeNodeTree],
  ['the memory fake', writeMemoryTree],
];

describe.each(subjects)('the FileSystem contract: %s', (_name, open) => {
  const { fileSystem, root } = open();
  const at = (path: string) => join(root, path);

  test('stat describes a symlink by itself, or by its target when followed', () => {
    expect(fileSystem.stat(at('link'), 'no-follow')).toBe('symlink');
    expect(fileSystem.stat(at('link'), 'follow')).toBe('file');
    expect(fileSystem.stat(at('empty'), 'no-follow')).toBe('directory');
    expect(fileSystem.stat(at('deep'), 'follow')).toBe('directory');
  });

  test.each(['nothing', 'dangling', 'a.md/below', 'link/below'])(
    'stat of %s, missing or below a file, is absent',
    (path) => {
      expect(fileSystem.stat(at(path), 'follow')).toBe('absent');
    },
  );

  test('stat through a symlink loop throws ELOOP', () => {
    throws(() => fileSystem.stat(at('loop'), 'follow'), { code: 'ELOOP' });
    expect(fileSystem.stat(at('loop'), 'no-follow')).toBe('symlink');
  });

  test.each([
    ['a.md', true],
    ['link', true],
    ['empty', true],
    ['nothing', false],
    ['dangling', false],
    ['loop', false],
    ['a.md/below', false],
  ] as const)('exists %s is %p and never throws', (path, expected) => {
    expect(fileSystem.exists(at(path))).toBe(expected);
  });

  test('reads text through a symlink; a missing file is ENOENT, a directory EISDIR', () => {
    expect(fileSystem.readText(at('link'))).toBe('a');
    throws(() => fileSystem.readText(at('nothing')), { code: 'ENOENT' });
    throws(() => fileSystem.readText(at('empty')), { code: 'EISDIR' });
  });

  test('reads a link target; a path that is no link throws', () => {
    expect(fileSystem.readLink(at('dangling'))).toBe('gone.md');
    throws(() => fileSystem.readLink(at('a.md')), { code: 'EINVAL' });
  });

  test('lists a directory by name and kind', () => {
    const listed = [...fileSystem.list(root)].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    expect(listed).toEqual([
      { name: 'a.md', kind: 'file' },
      { name: 'dangling', kind: 'symlink' },
      { name: 'deep', kind: 'directory' },
      { name: 'empty', kind: 'directory' },
      { name: 'link', kind: 'symlink' },
      { name: 'loop', kind: 'symlink' },
    ]);
  });

  test('writes, makes directories and removes a whole directory', () => {
    fileSystem.makeDirectory(at('x/y'));
    fileSystem.write(at('x/y/z.md'), 'z');
    expect(fileSystem.list(at('x'))).toEqual([{ name: 'y', kind: 'directory' }]);
    expect(fileSystem.readText(at('x/y/z.md'))).toBe('z');
    fileSystem.remove(at('x'));
    expect(fileSystem.stat(at('x'), 'no-follow')).toBe('absent');
  });
});

describe('the node adapter on failures the memory fake cannot hold', () => {
  const { fileSystem, root } = writeNodeTree();

  test('a name too long throws ENAMETOOLONG from stat and does not exist', () => {
    const long = join(root, 'n'.repeat(300));
    throws(() => fileSystem.stat(long, 'follow'), { code: 'ENAMETOOLONG' });
    expect(fileSystem.exists(long)).toBe(false);
  });

  test('a path in a directory that cannot be searched throws EACCES and does not exist', () => {
    const locked = join(root, 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'inside.md'), 'x');
    chmodSync(locked, 0o000);
    try {
      throws(() => fileSystem.stat(join(locked, 'inside.md'), 'follow'), { code: 'EACCES' });
      expect(fileSystem.exists(join(locked, 'inside.md'))).toBe(false);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});
