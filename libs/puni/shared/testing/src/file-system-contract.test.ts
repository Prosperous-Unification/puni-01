import { beforeAll, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createNodeFileSystem } from '@puni/shared-adapters';
import type { FileSystem } from '@puni/shared-ports';
import { createMemoryFileSystem, type MemoryTree } from './memory-host';
import { removeScratchDirectoriesAfterAll } from './scratch-directories';

const scratchDirectories = removeScratchDirectoriesAfterAll();

/** Whether anything, a dangling symlink included, is at the absolute `path` on this machine. */
function lstatOrAbsent(path: string): 'present' | 'absent' {
  try {
    lstatSync(path);
    return 'present';
  } catch {
    return 'absent';
  }
}

/** The tree every implementation is judged over, by path below its root. */
const tree: MemoryTree = {
  'a.md': 'a',
  link: { symlink: 'a.md' },
  dangling: { symlink: 'gone.md' },
  loop: { symlink: 'loop' },
  empty: { directory: true },
  'deep/b.md': 'b',
  'text/lines.txt': 'one\n\ntwo\nlast',
  'text/ended.txt': 'one\n',
  'text/empty.txt': '',
};

/** When `a.md` was last modified, in every implementation. */
const modifiedAt = new Date('2026-11-22T10:00:00.000Z');

/** A file system holding {@link tree} below `root`. */
interface Subject {
  readonly fileSystem: FileSystem;
  readonly root: string;
}

function writeNodeTree(): Subject {
  const root = scratchDirectories.createDirectory('puni-file-system-');
  for (const [path, node] of Object.entries(tree)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (typeof node === 'string') writeFileSync(absolute, node);
    else if ('symlink' in node) symlinkSync(node.symlink, absolute);
    else mkdirSync(absolute);
  }
  utimesSync(join(root, 'a.md'), modifiedAt, modifiedAt);
  return { fileSystem: createNodeFileSystem(), root };
}

function writeMemoryTree(): Subject {
  const root = '/m';
  const rooted = Object.fromEntries(
    Object.entries(tree).map(([path, node]) => [`${root}/${path}`, node]),
  );
  return {
    fileSystem: createMemoryFileSystem(rooted, { modified: { [`${root}/a.md`]: modifiedAt } }),
    root,
  };
}

const subjects: readonly (readonly [string, () => Subject])[] = [
  ['the node adapter', writeNodeTree],
  ['the memory fake', writeMemoryTree],
];

describe.each(subjects)('the FileSystem contract: %s', (_name, open) => {
  let fileSystem: FileSystem;
  let root: string;
  beforeAll(() => {
    ({ fileSystem, root } = open());
  });
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
      { name: 'text', kind: 'directory' },
    ]);
  });

  test.each([
    ['text/lines.txt', ['one', '', 'two', 'last']],
    ['text/ended.txt', ['one']],
    ['text/empty.txt', []],
    ['link', ['a']],
  ] as const)('reads the lines of %s without their newlines', (path, lines) => {
    expect([...fileSystem.readLines(at(path))]).toEqual([...lines]);
  });

  test('reading the lines of a missing file throws ENOENT on the first line taken', () => {
    const lines = fileSystem.readLines(at('nothing'));
    throws(() => [...lines], { code: 'ENOENT' });
  });

  test('reads when a file was last modified, through a symlink; a missing one is ENOENT', () => {
    expect(fileSystem.readModifiedTime(at('a.md'))).toEqual(modifiedAt);
    expect(fileSystem.readModifiedTime(at('link'))).toEqual(modifiedAt);
    throws(() => fileSystem.readModifiedTime(at('nothing')), { code: 'ENOENT' });
  });

  test('names an absolute home directory', () => {
    expect(fileSystem.homeDirectory()).toStartWith('/');
  });

  test('writes, makes directories and removes a whole directory', () => {
    fileSystem.makeDirectory(at('x/y'));
    fileSystem.write(at('x/y/z.md'), 'z');
    expect(fileSystem.list(at('x'))).toEqual([{ name: 'y', kind: 'directory' }]);
    expect(fileSystem.readText(at('x/y/z.md'))).toBe('z');
    fileSystem.remove(at('x'));
    expect(fileSystem.stat(at('x'), 'no-follow')).toBe('absent');
  });

  test('makes a symlink holding its target text; anything already there is EEXIST', () => {
    fileSystem.makeLink(at('made'), 'a.md');
    expect(fileSystem.stat(at('made'), 'no-follow')).toBe('symlink');
    expect(fileSystem.readLink(at('made'))).toBe('a.md');
    expect(fileSystem.readText(at('made'))).toBe('a');
    for (const taken of ['made', 'a.md', 'empty', 'dangling']) {
      throws(
        () => {
          fileSystem.makeLink(at(taken), 'other');
        },
        { code: 'EEXIST' },
      );
    }
    expect(fileSystem.readText(at('a.md'))).toBe('a');
    fileSystem.remove(at('made'));
  });

  test('refuses a relative path to every change, changing nothing where the process runs', () => {
    const probe = 'puni-relative-probe';
    const changes: readonly (() => void)[] = [
      () => {
        fileSystem.write(probe, 'x');
      },
      () => {
        fileSystem.makeDirectory(probe);
      },
      () => {
        fileSystem.makeLink(probe, at('a.md'));
      },
      () => {
        fileSystem.remove(probe);
      },
    ];
    try {
      for (const change of changes) throws(change, /is not an absolute path/u);
      expect(lstatOrAbsent(join(process.cwd(), probe))).toBe('absent');
    } finally {
      rmSync(join(process.cwd(), probe), { force: true, recursive: true });
    }
  });
});

describe('the node adapter where the memory fake cannot follow', () => {
  let fileSystem: FileSystem;
  let root: string;
  beforeAll(() => {
    ({ fileSystem, root } = writeNodeTree());
  });

  test('the home directory is the one the operating system names', () => {
    expect(fileSystem.homeDirectory()).toBe(homedir());
  });

  test('a line longer than one read, a character split between reads, and many lines are whole', () => {
    const long = 'é'.repeat(700_000);
    const many = Array.from({ length: 50_000 }, (_unused, index) => `line ${String(index)}`);
    writeFileSync(join(root, 'big.txt'), `${long}\nx${long}\n${many.join('\n')}`);
    expect([...fileSystem.readLines(join(root, 'big.txt'))]).toEqual([long, `x${long}`, ...many]);
  });
});

describe('the node adapter on failures the memory fake cannot hold', () => {
  let fileSystem: FileSystem;
  let root: string;
  beforeAll(() => {
    ({ fileSystem, root } = writeNodeTree());
  });

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
