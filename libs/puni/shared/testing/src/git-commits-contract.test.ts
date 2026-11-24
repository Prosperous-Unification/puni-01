import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import type { Git, GitCommit } from '@puni/shared-ports';
import { memoryHost } from './memory-host';

/** A git and a repository whose `main` holds the commits {@link expected} lists after `base`. */
interface Subject {
  readonly git: Git;
  readonly root: string;
}

const temporaries: string[] = [];

afterAll(() => {
  for (const directory of temporaries) rmSync(directory, { recursive: true, force: true });
});

/** A path git quotes in a diff header. */
const quotedPath = 'dir/naïve "file".txt';

/** The commits of `base..main`, oldest first, without their hashes. */
const expected: readonly Omit<GitCommit, 'hash'>[] = [
  {
    message: 'first\n\nbody line\n',
    added: [
      { path: 'a.txt', line: 2, text: 'two' },
      { path: 'b.txt', line: 1, text: 'x' },
      { path: 'b.txt', line: 2, text: '++ plus' },
    ],
  },
  { message: 'second\n', added: [{ path: quotedPath, line: 1, text: 'z' }] },
  { message: 'side\n', added: [{ path: 's.txt', line: 1, text: 's' }] },
  { message: 'merge side\n', added: [{ path: 's.txt', line: 1, text: 's' }] },
];

function openBunGit(): Subject {
  const root = mkdtempSync(join(tmpdir(), 'puni-git-commits-'));
  temporaries.push(root);
  let second = 0;
  const git = (...args: string[]): void => {
    second += 1;
    const date = `2026-11-22T09:00:${String(second).padStart(2, '0')}Z`;
    const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
  };
  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '--cleanup=verbatim', '-m', message);
  };
  git('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a.txt'), 'one\n');
  commit('base');
  git('tag', 'base');
  writeFileSync(join(root, 'a.txt'), 'one\ntwo\n');
  writeFileSync(join(root, 'b.txt'), 'x\n++ plus\n');
  commit('first\n\nbody line\n');
  rmSync(join(root, 'b.txt'));
  mkdirSync(join(root, 'dir'));
  writeFileSync(join(root, quotedPath), 'z\n');
  commit('second\n');
  git('checkout', '-qb', 'side');
  writeFileSync(join(root, 's.txt'), 's\n');
  commit('side\n');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '--cleanup=verbatim', '-m', 'merge side\n', 'side');
  return { git: createBunGit({ processRunner: createBunProcessRunner() }), root };
}

function openMemoryGit(): Subject {
  const commits = expected.map((commit, index) => ({ ...commit, hash: `abc000${String(index)}` }));
  const git = memoryHost({}, { commits: { '/r': { 'base..main': commits } } }).services.git();
  return { git, root: '/r' };
}

describe.each([
  ['the bun adapter', openBunGit],
  ['the memory fake', openMemoryGit],
] as const)('the Git commits contract: %s', (_name, open) => {
  const { git, root } = open();

  test('every commit of the range, oldest first, with its message and added lines', () => {
    const listed = git.listCommits(root, 'base', 'main');
    if (!('commits' in listed)) throw new Error(JSON.stringify(listed));
    expect(listed.commits.map(({ hash }) => /^[0-9a-f]{7,}$/u.test(hash))).toEqual(
      expected.map(() => true),
    );
    expect(listed.commits.map(({ message, added }) => ({ message, added }))).toEqual([...expected]);
  });

  test('an end naming no commit is unknown, naming it', () => {
    expect(git.listCommits(root, 'base', 'no-such-branch')).toEqual({ unknown: 'no-such-branch' });
  });
});
