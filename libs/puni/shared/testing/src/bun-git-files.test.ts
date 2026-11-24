import { beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
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

  /** Runs git in the scratch root with a fixed identity, returning its exit code. */
  const runIn = (...args: string[]) =>
    Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root })
      .exitCode;
  const commitHash = '0123456789abcdef0123456789abcdef01234567';

  test('lists index entries by the kind their mode names, a symlink with its target', () => {
    runIn('init', '-q');
    writeFileSync(join(root, 'a.md'), 'a');
    writeFileSync(join(root, 'run.sh'), '#!/bin/sh\n');
    chmodSync(join(root, 'run.sh'), 0o755);
    symlinkSync('a.md', join(root, 'link'));
    symlinkSync('/nowhere/at/all', join(root, 'far'));
    writeFileSync(join(root, 'untracked.md'), 'u');
    runIn('add', 'a.md', 'run.sh', 'link', 'far');
    runIn('update-index', '--add', '--cacheinfo', `160000,${commitHash},vendor/sub`);
    expect(git.listIndexEntries(root)).toEqual({
      entries: [
        { path: 'a.md', kind: 'file' },
        { path: 'far', kind: 'symlink', target: '/nowhere/at/all' },
        { path: 'link', kind: 'symlink', target: 'a.md' },
        { path: 'run.sh', kind: 'file' },
        { path: 'vendor/sub', kind: 'gitlink' },
      ],
    });
  });

  test('index entries of an index holding unmerged entries are a failure naming them', () => {
    runIn('init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a.md'), 'base\n');
    runIn('add', '-A');
    runIn('commit', '-qm', 'base');
    runIn('switch', '-qc', 'side');
    writeFileSync(join(root, 'a.md'), 'side\n');
    runIn('commit', '-qam', 'side');
    runIn('switch', '-q', 'main');
    writeFileSync(join(root, 'a.md'), 'main\n');
    runIn('commit', '-qam', 'main');
    expect(runIn('merge', '-q', 'side')).not.toBe(0);
    expect(git.listIndexEntries(root)).toEqual({
      failure: 'the git index has unmerged entries: a.md',
    });
  });

  test('staged files are the new paths of files and symlinks, never a gitlink', () => {
    runIn('init', '-q');
    writeFileSync(join(root, 'old.md'), 'a long enough text for git to see a rename\n');
    runIn('add', '-A');
    runIn('commit', '-qm', 'base');
    renameSync(join(root, 'old.md'), join(root, 'new.md'));
    symlinkSync('new.md', join(root, 'link'));
    runIn('add', '-A');
    runIn('update-index', '--add', '--cacheinfo', `160000,${commitHash},vendor/sub`);
    expect(git.listStagedFiles(root)).toEqual({ files: ['link', 'new.md'] });
    expect(git.readStagedText(root, 'link')).toEqual({ text: 'new.md' });
  });
});
