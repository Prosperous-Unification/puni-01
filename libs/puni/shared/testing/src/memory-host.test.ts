import { describe, expect, test } from 'bun:test';
import { memoryHost } from './memory-host';

describe('memoryHost', () => {
  test('git shows every file and symlink below the root, and sees writes', () => {
    const host = memoryHost({ '/r/b.md': 'b', '/r/l': { symlink: 'b.md' }, '/other/x': 'x' });
    host.services.fileSystem().write('/r/a.md', 'a');
    expect(host.services.git().listVisibleFiles('/r')).toEqual({ files: ['a.md', 'b.md', 'l'] });
  });

  test('git lists and reads the staged texts it was given, below the root only', () => {
    const git = memoryHost({}, { staged: { '/r/a.md': 'a', '/other/b.md': 'b' } }).services.git();
    expect(git.listStagedFiles('/r')).toEqual({ files: ['a.md'] });
    expect(git.readStagedText('/r', 'a.md')).toEqual({ text: 'a' });
    expect(git.readStagedText('/r', 'b.md')).toEqual({ failure: 'b.md is not staged' });
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
