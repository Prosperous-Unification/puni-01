import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import type { Git } from '@puni/shared-ports';
import { memoryHost } from './memory-host';
import { runGit } from './repository-files';

/**
 * A git, a repository `root` on `main` with one commit, and how to make the worktree at a path
 * dirty or give the branch checked out there a commit `main` lacks.
 */
interface Subject {
  readonly git: Git;
  readonly root: string;
  readonly dirty: (path: string) => void;
  readonly commit: (path: string, branch: string) => void;
}

const temporaries: string[] = [];
const identity = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

afterAll(() => {
  for (const directory of temporaries) rmSync(directory, { recursive: true, force: true });
});

function openBunGit(): Subject {
  const parent = mkdtempSync(join(tmpdir(), 'puni-git-worktree-'));
  temporaries.push(parent);
  const root = join(parent, 'repo');
  runGit(parent, ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'a.md'), 'a');
  runGit(root, ['add', '-A']);
  runGit(root, [...identity, 'commit', '-qm', 'a']);
  return {
    git: createBunGit({ processRunner: createBunProcessRunner() }),
    root,
    dirty: (path) => {
      writeFileSync(join(path, 'b.md'), 'b');
    },
    commit: (path) => {
      writeFileSync(join(path, 'c.md'), 'c');
      runGit(path, ['add', '-A']);
      runGit(path, [...identity, 'commit', '-qm', 'c']);
    },
  };
}

function openMemoryGit(): Subject {
  const changed: Record<string, readonly string[]> = {};
  const unmerged: string[] = [];
  const git = memoryHost({}, { changed, unmerged }).services.git();
  return {
    git,
    root: '/repo',
    dirty: (path) => {
      changed[path] = ['b.md'];
    },
    commit: (_path, branch) => {
      unmerged.push(branch);
    },
  };
}

describe.each([
  ['the bun adapter', openBunGit],
  ['the memory fake', openMemoryGit],
] as const)('the Git worktree contract: %s', (_name, open) => {
  test('a repository lists its main worktree, on its branch, and its branches by prefix', () => {
    const { git, root } = open();
    expect(git.listWorktrees(root)).toEqual({ worktrees: [{ path: root, branch: 'main' }] });
    expect(git.listBranches(root, 'resources', 'all')).toEqual({ branches: [] });
    expect(git.listBranches(root, 'main', 'all')).toEqual({ branches: ['main'] });
    expect(git.listChangedFiles(root)).toEqual({ files: [] });
  });

  test('an added worktree is listed on its new branch, clean, merged, and removable', () => {
    const { git, root } = open();
    const path = `${root}/.worktrees/one`;
    expect(git.addWorktree(root, path, 'resources/one', 'HEAD')).toEqual({ changed: true });
    expect(git.listWorktrees(root)).toEqual({
      worktrees: [
        { path: root, branch: 'main' },
        { path, branch: 'resources/one' },
      ],
    });
    expect(git.listWorktrees(path)).toEqual(git.listWorktrees(root));
    expect(git.listBranches(root, 'resources', 'all')).toEqual({ branches: ['resources/one'] });
    expect(git.listBranches(root, 'resource', 'all')).toEqual({ branches: [] });
    expect(git.listBranches(root, 'resources', 'unmerged')).toEqual({ branches: [] });
    expect(git.listChangedFiles(path)).toEqual({ files: [] });
    expect(git.removeWorktree(root, path, false)).toEqual({ changed: true });
    expect(git.deleteBranch(root, 'resources/one', false)).toEqual({ changed: true });
    expect(git.listWorktrees(root)).toEqual({ worktrees: [{ path: root, branch: 'main' }] });
    expect(git.listBranches(root, 'resources', 'all')).toEqual({ branches: [] });
  });

  test('an existing branch is a failure to add', () => {
    const { git, root } = open();
    git.addWorktree(root, `${root}/.worktrees/one`, 'resources/one', 'HEAD');
    expect(
      'failure' in git.addWorktree(root, `${root}/.worktrees/two`, 'resources/one', 'HEAD'),
    ).toBe(true);
  });

  test('a worktree with changes is removed only with force', () => {
    const { git, root, dirty } = open();
    const path = `${root}/.worktrees/one`;
    git.addWorktree(root, path, 'resources/one', 'HEAD');
    dirty(path);
    expect(git.listChangedFiles(path)).toEqual({ files: ['b.md'] });
    expect('failure' in git.removeWorktree(root, path, false)).toBe(true);
    expect(git.removeWorktree(root, path, true)).toEqual({ changed: true });
  });

  test('a branch with a commit HEAD lacks is unmerged and deleted only with force', () => {
    const { git, root, commit } = open();
    const path = `${root}/.worktrees/one`;
    git.addWorktree(root, path, 'resources/one', 'HEAD');
    commit(path, 'resources/one');
    expect(git.listBranches(root, 'resources', 'unmerged')).toEqual({
      branches: ['resources/one'],
    });
    git.removeWorktree(root, path, false);
    expect('failure' in git.deleteBranch(root, 'resources/one', false)).toBe(true);
    expect(git.deleteBranch(root, 'resources/one', true)).toEqual({ changed: true });
  });
});
