import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunGit } from './bun-git.repository';
import { createBunProcessRunner } from './bun-process-runner.repository';
import { createNodeFileSystem } from './node-file-system.repository';

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'puni-adapters-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createNodeFileSystem', () => {
  test('stat describes a symlink by itself or by its target, and a dangling one as absent when followed', () => {
    const fileSystem = createNodeFileSystem();
    writeFileSync(join(root, 'a.md'), 'a');
    symlinkSync('a.md', join(root, 'link'));
    symlinkSync('gone.md', join(root, 'dangling'));
    expect(fileSystem.stat(join(root, 'link'), 'no-follow')).toBe('symlink');
    expect(fileSystem.stat(join(root, 'link'), 'follow')).toBe('file');
    expect(fileSystem.stat(join(root, 'dangling'), 'follow')).toBe('absent');
    expect(fileSystem.stat(join(root, 'nothing'), 'no-follow')).toBe('absent');
  });

  test('a stat failure other than a missing path throws', () => {
    writeFileSync(join(root, 'a.md'), 'a');
    throws(() => createNodeFileSystem().stat(join(root, 'a.md', 'below'), 'no-follow'), /ENOTDIR/u);
  });

  test('lists, writes, removes and makes directories', () => {
    const fileSystem = createNodeFileSystem();
    fileSystem.makeDirectory(join(root, 'x/y'));
    fileSystem.write(join(root, 'x/y/z.md'), 'z');
    expect(fileSystem.list(join(root, 'x'))).toEqual([{ name: 'y', kind: 'directory' }]);
    expect(fileSystem.readText(join(root, 'x/y/z.md'))).toBe('z');
    fileSystem.remove(join(root, 'x'));
    expect(fileSystem.stat(join(root, 'x'), 'no-follow')).toBe('absent');
  });
});

describe('createBunProcessRunner', () => {
  test('a program that cannot start is unstarted, not an exit', () => {
    expect(createBunProcessRunner().run(['puni-no-such-program'], { cwd: root }).kind).toBe(
      'unstarted',
    );
  });
});

describe('createBunGit', () => {
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

  test('a git that cannot start is a failure', () => {
    const unstarted = createBunGit({
      processRunner: { run: () => ({ kind: 'unstarted', reason: 'no git' }) },
    });
    expect(unstarted.listVisibleFiles(root)).toEqual({ failure: 'git could not run: no git' });
  });
});
