import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import { removeScratchDirectoriesAfterEach } from './scratch-directories';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let root = '';

beforeEach(() => {
  root = scratchDirectories.createDirectory('puni-bun-git-');
});

describe('createBunGit over a directory on disk', () => {
  const git = createBunGit({ processRunner: createBunProcessRunner() });

  test('lists tracked and untracked files git does not ignore', () => {
    expect(Bun.spawnSync(['git', 'init', '-q'], { cwd: root }).exitCode).toBe(0);
    writeFileSync(join(root, '.gitignore'), 'ignored/\n');
    mkdirSync(join(root, 'ignored'));
    writeFileSync(join(root, 'ignored/x'), 'x');
    writeFileSync(join(root, 'kept.md'), 'k');
    expect(git.listVisibleFiles(root)).toEqual({ files: ['.gitignore', 'kept.md'] });
  });

  test('outside a repository it is a failure naming the exit code and the reason', () => {
    expect(git.listVisibleFiles(root)).toEqual({
      failure:
        'git ls-files exited 128: fatal: not a git repository (or any of the parent directories): .git',
    });
  });

  test('an index holding unmerged entries is a failure naming them, not a doubled listing', () => {
    const git = (...args: string[]) =>
      Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a.md'), 'base\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('switch', '-qc', 'side');
    writeFileSync(join(root, 'a.md'), 'side\n');
    git('commit', '-qam', 'side');
    git('switch', '-q', 'main');
    writeFileSync(join(root, 'a.md'), 'main\n');
    git('commit', '-qam', 'main');
    expect(git('merge', '-q', 'side').exitCode).not.toBe(0);
    expect(
      createBunGit({ processRunner: createBunProcessRunner() }).listVisibleFiles(root),
    ).toEqual({ failure: 'the git index has unmerged entries: a.md' });
  });

  test('lists staged files and reads their staged text, not the working tree', () => {
    expect(Bun.spawnSync(['git', 'init', '-q'], { cwd: root }).exitCode).toBe(0);
    writeFileSync(join(root, 'a.md'), 'staged');
    writeFileSync(join(root, 'b.md'), 'unstaged');
    expect(Bun.spawnSync(['git', 'add', 'a.md'], { cwd: root }).exitCode).toBe(0);
    writeFileSync(join(root, 'a.md'), 'edited after staging');
    expect(git.listStagedFiles(root)).toEqual({ files: ['a.md'] });
    expect(git.readStagedText(root, 'a.md')).toEqual({ text: 'staged' });
    const unstaged = git.readStagedText(root, 'b.md');
    expect('failure' in unstaged && unstaged.failure).toStartWith('git cat-file exited 128: ');
  });
});
