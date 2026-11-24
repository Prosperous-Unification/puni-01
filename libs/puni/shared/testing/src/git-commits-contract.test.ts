import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import type { Git, GitCommit, ProcessOutcome, ProcessRunner } from '@puni/shared-ports';
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

/** A commit as the contract compares it: everything but its hashes. */
type Listed = Omit<GitCommit, 'fullHash' | 'shortHash'>;

/** The commits of `base..main`, oldest first. */
const expected: readonly Listed[] = [
  {
    message: 'first\n\nbody line\n',
    addedLines: [
      { path: 'a.txt', line: 2, text: 'two' },
      { path: 'b.txt', line: 1, text: 'x' },
      { path: 'b.txt', line: 2, text: '++ plus' },
    ],
  },
  { message: 'second\n', addedLines: [{ path: quotedPath, line: 1, text: 'z' }] },
  { message: 'side\n', addedLines: [{ path: 's.txt', line: 1, text: 's' }] },
  { message: 'merge side\n', addedLines: [{ path: 's.txt', line: 1, text: 's' }] },
  {
    message: 'rename\n',
    addedLines: [
      { path: 'moved.txt', line: 1, text: 'one' },
      { path: 'moved.txt', line: 2, text: 'two' },
    ],
  },
];

/** The one commit of `main..orphan`: a commit with no parent. */
const expectedRoot: readonly Listed[] = [
  { message: 'orphan\n', addedLines: [{ path: 'r.txt', line: 1, text: 'r' }] },
];

/** A temporary repository and a git runner in it, each commit a second after the last. */
function makeRepository(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(root);
  let second = 0;
  const git = (...args: string[]): string => {
    second += 1;
    const date = `2026-11-22T09:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}Z`;
    const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
    return child.stdout.toString().trim();
  };
  const commit = (message: string): string => {
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '--cleanup=verbatim', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const write = (path: string, text: string) => {
    writeFileSync(join(root, path), text);
  };
  git('init', '-q', '-b', 'main');
  return { root, git, commit, write };
}

const bunGit = (): Git => createBunGit({ processRunner: createBunProcessRunner() });

function openBunGit(): Subject {
  const { root, git, commit, write } = makeRepository('puni-git-commits-');
  write('a.txt', 'one\n');
  commit('base');
  git('tag', 'base');
  write('a.txt', 'one\ntwo\n');
  write('b.txt', 'x\n++ plus\n');
  commit('first\n\nbody line\n');
  rmSync(join(root, 'b.txt'));
  mkdirSync(join(root, 'dir'));
  write(quotedPath, 'z\n');
  commit('second\n');
  git('checkout', '-qb', 'side');
  write('s.txt', 's\n');
  commit('side\n');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '--cleanup=verbatim', '-m', 'merge side\n', 'side');
  git('mv', 'a.txt', 'moved.txt');
  commit('rename\n');
  git('checkout', '-q', '--orphan', 'orphan');
  git('rm', '-rqf', '.');
  write('r.txt', 'r\n');
  commit('orphan\n');
  git('checkout', '-q', 'main');
  return { git: bunGit(), root };
}

function openMemoryGit(): Subject {
  const hashed = (commits: readonly Listed[]) =>
    commits.map((commit, index) => ({
      ...commit,
      fullHash: String(index).padEnd(40, 'a'),
      shortHash: String(index).padEnd(7, 'a'),
    }));
  const git = memoryHost(
    {},
    { commits: { '/r': { 'base..main': hashed(expected), 'main..orphan': hashed(expectedRoot) } } },
  ).services.git();
  return { git, root: '/r' };
}

/** What `listCommits` gives for `base..head`, its hashes judged by their form. */
function listCommits(git: Git, root: string, base: string, head: string) {
  const listed = git.listCommits(root, base, head);
  if (!('commits' in listed)) throw new Error(JSON.stringify(listed));
  for (const { fullHash, shortHash } of listed.commits) {
    expect([fullHash, /^[0-9a-f]{40}$/u.test(fullHash)]).toEqual([fullHash, true]);
    expect([shortHash, fullHash.startsWith(shortHash) && shortHash.length >= 7]).toEqual([
      shortHash,
      true,
    ]);
  }
  return listed.commits.map(({ message, addedLines }) => ({ message, addedLines }));
}

describe.each([
  ['the bun adapter', openBunGit],
  ['the memory fake', openMemoryGit],
] as const)('the Git commits contract: %s', (_name, open) => {
  const { git, root } = open();

  test('every commit of the range, oldest first, with its message and added lines; a renamed file adds every line', () => {
    expect(listCommits(git, root, 'base', 'main')).toEqual([...expected]);
  });

  test('a commit with no parent adds every line it holds', () => {
    expect(listCommits(git, root, 'main', 'orphan')).toEqual([...expectedRoot]);
  });

  test('an end naming no commit is unknown, naming it', () => {
    expect(git.listCommits(root, 'base', 'no-such-branch')).toEqual({ unknown: 'no-such-branch' });
  });
});

describe('the bun adapter reads what a commit adds, whatever the repository says', () => {
  const token = 'secret-line';

  test.each([
    ['a -diff attribute in the same commit', '*.dat -diff\n'],
    ['a binary glob in the same commit', '*.dat binary\n'],
    ['a diff driver with a text conversion', '*.dat diff=hide\n'],
  ])('%s', (_name, attributes) => {
    const { root, git, commit, write } = makeRepository('puni-git-attributes-');
    commit('base');
    git('config', 'diff.hide.textconv', 'sed s/secret/hidden/');
    write('.gitattributes', attributes);
    write('a.dat', `${token}\n`);
    commit('add');
    const listed = listCommits(bunGit(), root, 'HEAD~1', 'HEAD');
    expect(listed[0]?.addedLines).toContainEqual({ path: 'a.dat', line: 1, text: token });
  });

  test('an attribute arriving only in a later commit exempts no earlier one', () => {
    const { root, commit, write } = makeRepository('puni-git-attributes-');
    commit('base');
    write('a.dat', `${token}\n`);
    commit('add');
    write('.gitattributes', '*.dat binary\n');
    commit('mark binary');
    const listed = listCommits(bunGit(), root, 'HEAD~2', 'HEAD');
    expect(listed[0]?.addedLines).toEqual([{ path: 'a.dat', line: 1, text: token }]);
  });

  test('a ref named like a short hash does not stand in for the commit', () => {
    const { root, git, commit, write } = makeRepository('puni-git-short-');
    commit('base');
    git('tag', 'base');
    write('a.txt', `${token}\n`);
    const added = commit('add');
    for (let length = 4; length <= 40; length += 1) git('tag', added.slice(0, length), 'base');
    expect(listCommits(bunGit(), root, 'base', 'main')).toEqual([
      { message: 'add\n', addedLines: [{ path: 'a.txt', line: 1, text: token }] },
    ]);
  });
});

/** A process runner answering each git subcommand from `answers`, recording every argv. */
function scriptRunner(answers: Readonly<Record<string, string>>) {
  const runs: (readonly string[])[] = [];
  const runner: ProcessRunner = {
    run(argv): ProcessOutcome {
      runs.push(argv);
      const subcommand = argv.find(
        (word, index) => index > 0 && !word.startsWith('-') && argv[index - 1] !== '-c',
      );
      const stdout = answers[subcommand ?? ''];
      return stdout === undefined
        ? { kind: 'exited', exitCode: 1, stdout: '', stderr: 'no answer' }
        : { kind: 'exited', exitCode: 0, stdout, stderr: '' };
    },
    runAttached: () => ({ kind: 'unstarted', reason: 'not scripted' }),
  };
  return { runner, runs };
}

describe('the bun adapter, scripted', () => {
  const fullHash = 'f'.repeat(40);
  const answers = (patch: string) => ({
    'rev-parse': `${fullHash}\n`,
    'hash-object': `${'e'.repeat(40)}\n`,
    'rev-list': `${fullHash} fffffff\n`,
    'cat-file': 'tree x\n\nmessage\n',
    'diff-tree': patch,
  });

  test.each([
    [
      'a line inside a hunk that is no added or removed line',
      '+++ b/a.txt\n@@ -0,0 +1 @@\n garbage\n+one\n',
    ],
    ['a patch ending inside a hunk', '+++ b/a.txt\n@@ -0,0 +1,2 @@\n+one'],
    ['a hunk header it cannot read', '+++ b/a.txt\n@@ nonsense @@\n+one\n'],
  ])('%s is a failure, never a partial list', (_name, patch) => {
    const { runner } = scriptRunner(answers(patch));
    const listed = createBunGit({ processRunner: runner }).listCommits('/r', 'base', 'main');
    if (!('failure' in listed)) throw new Error(JSON.stringify(listed));
    expect(listed.failure).toContain('git diff-tree printed an unexpected line');
  });

  test('every revision follows --end-of-options, and the patch is text without renames, attributes or conversions', () => {
    const { runner, runs } = scriptRunner(answers('+++ b/a.txt\n@@ -0,0 +1 @@\n+one\n'));
    expect(createBunGit({ processRunner: runner }).listCommits('/r', 'base', 'main')).toMatchObject(
      {
        commits: [{ fullHash, shortHash: 'fffffff' }],
      },
    );
    // `cat-file` is asked only by a full hash `rev-list` printed, never option-shaped.
    for (const argv of runs.filter((run) => !run.includes('cat-file'))) {
      const revision = argv.findIndex((word) => word === fullHash || /base|main/u.test(word));
      if (revision !== -1) expect([argv, argv[revision - 1]]).toEqual([argv, '--end-of-options']);
    }
    const diffTree = runs.find((argv) => argv.includes('diff-tree')) ?? [];
    for (const flag of [
      '--root',
      '--text',
      '--no-renames',
      '--no-textconv',
      '--no-ext-diff',
      'core.attributesFile=/dev/null',
      `--attr-source=${'e'.repeat(40)}`,
    ]) {
      expect([flag, diffTree.includes(flag)]).toEqual([flag, true]);
    }
  });
});
