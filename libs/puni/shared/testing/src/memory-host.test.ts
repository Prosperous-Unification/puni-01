import { describe, expect, test } from 'bun:test';
import { createMemoryFileSystem, memoryHost } from './memory-host';

describe('createMemoryFileSystem', () => {
  const fileSystem = createMemoryFileSystem({
    '/r/a.md': 'a',
    '/r/link': { symlink: 'a.md' },
    '/r/dangling': { symlink: 'gone.md' },
    '/r/empty': { directory: true },
  });

  test('describes files, symlinks, directories and absence like lstat and stat', () => {
    expect(fileSystem.stat('/r/link', 'no-follow')).toBe('symlink');
    expect(fileSystem.stat('/r/link', 'follow')).toBe('file');
    expect(fileSystem.stat('/r/dangling', 'follow')).toBe('absent');
    expect(fileSystem.stat('/r', 'no-follow')).toBe('directory');
    expect(fileSystem.stat('/r/empty', 'no-follow')).toBe('directory');
    expect(fileSystem.stat('/r/none', 'no-follow')).toBe('absent');
  });

  test('reads through a symlink, and a missing file throws ENOENT', () => {
    expect(fileSystem.readText('/r/link')).toBe('a');
    expect(() => fileSystem.readText('/r/dangling')).toThrow(/ENOENT/u);
  });

  test('lists a directory by name and kind', () => {
    expect(fileSystem.list('/r')).toEqual([
      { name: 'a.md', kind: 'file' },
      { name: 'dangling', kind: 'symlink' },
      { name: 'empty', kind: 'directory' },
      { name: 'link', kind: 'symlink' },
    ]);
  });
});

describe('memoryHost', () => {
  test('git shows every file and symlink below the root, and sees writes', () => {
    const host = memoryHost({ '/r/b.md': 'b', '/r/l': { symlink: 'b.md' }, '/other/x': 'x' });
    host.services.fileSystem().write('/r/a.md', 'a');
    expect(host.services.git().listVisibleFiles('/r')).toEqual({ files: ['a.md', 'b.md', 'l'] });
  });

  test('git fails when told to, and an unknown process is unstarted', () => {
    const host = memoryHost({}, { gitFailure: 'no git' });
    expect(host.services.git().listVisibleFiles('/r')).toEqual({ failure: 'no git' });
    expect(host.services.processRunner().run(['ssh', 'x'], { cwd: '/' })).toEqual({
      kind: 'unstarted',
      reason: 'ssh x is not in the memory host',
    });
  });
});
