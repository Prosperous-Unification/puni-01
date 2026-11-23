import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import type { Git, GitMerge } from '@puni/shared-ports';
import { memoryHost } from './memory-host';

/**
 * A git and a repository whose `main` merged `feature` (which itself merged `inner`) and then
 * `other`; `outer` is the hash of the merge of `feature`.
 */
interface Subject {
  readonly git: Git;
  readonly root: string;
  readonly outer: string;
}

const temporaries: string[] = [];

afterAll(() => {
  for (const directory of temporaries) rmSync(directory, { recursive: true, force: true });
});

const times = {
  inner: '2026-11-22T09:00:00Z',
  feature: '2026-11-22T10:00:00Z',
  other: '2026-11-22T11:00:00Z',
} as const;

/** Runs git in `root` at `date`, committer and author alike. */
function runGitAt(root: string, args: readonly string[], date: string = times.inner): string {
  const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
  return child.stdout.toString().trim();
}

function openBunGit(): Subject {
  const root = mkdtempSync(join(tmpdir(), 'puni-git-merges-'));
  temporaries.push(root);
  const commit = (file: string) => {
    writeFileSync(join(root, file), file);
    runGitAt(root, ['add', '-A']);
    runGitAt(root, ['commit', '-qm', file]);
  };
  const merge = (branch: string, subject: string, date: string) => {
    runGitAt(root, ['merge', '-q', '--no-ff', '-m', subject, branch], date);
  };
  runGitAt(root, ['init', '-q', '-b', 'main']);
  commit('base');
  runGitAt(root, ['checkout', '-qb', 'feature']);
  commit('f');
  runGitAt(root, ['checkout', '-qb', 'inner']);
  commit('i');
  runGitAt(root, ['checkout', '-q', 'feature']);
  merge('inner', 'Merge pull request #1 from acme/inner', times.inner);
  runGitAt(root, ['checkout', '-q', 'main']);
  merge('feature', 'Merge pull request #2 from acme/feature', times.feature);
  const outer = runGitAt(root, ['rev-parse', 'HEAD']);
  runGitAt(root, ['checkout', '-qb', 'other']);
  commit('o');
  runGitAt(root, ['checkout', '-q', 'main']);
  merge('other', 'Merge pull request #3 from acme/other', times.other);
  return { git: createBunGit({ processRunner: createBunProcessRunner() }), root, outer };
}

function openMemoryGit(): Subject {
  const outer = 'b'.repeat(40);
  const merge = (hash: string, number: number, branch: keyof typeof times): GitMerge => ({
    hash,
    committedAt: new Date(times[branch]),
    subject: `Merge pull request #${String(number)} from acme/${branch}`,
  });
  const git = memoryHost(
    {},
    {
      merges: {
        '/r': {
          'first-parent main': [merge('c'.repeat(40), 3, 'other'), merge(outer, 2, 'feature')],
          [`all ${outer}^1..${outer}`]: [
            merge(outer, 2, 'feature'),
            merge('a'.repeat(40), 1, 'inner'),
          ],
        },
      },
    },
  ).services.git();
  return { git, root: '/r', outer };
}

describe.each([
  ['the bun adapter', openBunGit],
  ['the memory fake', openMemoryGit],
] as const)('the Git merges contract: %s', (_name, open) => {
  const { git, root, outer } = open();

  const listed = (revisions: string, ancestry: 'all' | 'first-parent') => {
    const merges = git.listMerges(root, revisions, ancestry);
    if ('failure' in merges) throw new Error(merges.failure);
    return merges.merges.map(({ hash, committedAt, subject }) => ({
      hash: /^[0-9a-f]{40}$/u.test(hash),
      committedAt: committedAt.toISOString(),
      subject,
    }));
  };

  test('first-parent merges of main, newest first, with full hash, committer time and subject', () => {
    expect(listed('main', 'first-parent')).toEqual([
      {
        hash: true,
        committedAt: '2026-11-22T11:00:00.000Z',
        subject: 'Merge pull request #3 from acme/other',
      },
      {
        hash: true,
        committedAt: '2026-11-22T10:00:00.000Z',
        subject: 'Merge pull request #2 from acme/feature',
      },
    ]);
  });

  test('every merge a range reaches, nested merges included', () => {
    expect(listed(`${outer}^1..${outer}`, 'all').map(({ subject }) => subject)).toEqual([
      'Merge pull request #2 from acme/feature',
      'Merge pull request #1 from acme/inner',
    ]);
  });

  test('an unknown revision is a failure', () => {
    expect('failure' in git.listMerges(root, 'no-such-branch', 'first-parent')).toBe(true);
  });
});
