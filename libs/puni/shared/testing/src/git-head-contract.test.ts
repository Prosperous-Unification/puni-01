import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBunGit, createBunProcessRunner } from '@puni/shared-adapters';
import type { Git } from '@puni/shared-ports';
import { memoryHost } from './memory-host';
import { runGit } from './repository-files';
import { removeScratchDirectoriesAfterAll } from './scratch-directories';

const scratch = removeScratchDirectoriesAfterAll();

/** A git and two repositories: `committed`, whose HEAD names a commit, and `empty`, with none. */
interface Subject {
  readonly git: Git;
  readonly committed: string;
  readonly empty: string;
}

function openBunGit(): Subject {
  const parent = scratch.createDirectory('puni-git-head-');
  const [committed, empty] = [join(parent, 'committed'), join(parent, 'empty')];
  for (const root of [committed, empty]) runGit(parent, ['init', '-q', root]);
  writeFileSync(join(committed, 'a.md'), 'a');
  runGit(committed, ['add', '-A']);
  runGit(committed, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a']);
  return { git: createBunGit({ processRunner: createBunProcessRunner() }), committed, empty };
}

function openMemoryGit(): Subject {
  const git = memoryHost({}, { heads: { '/committed': 'abc1234' } }).services.git();
  return { git, committed: '/committed', empty: '/empty' };
}

describe.each([
  ['the bun adapter', openBunGit],
  ['the memory fake', openMemoryGit],
] as const)('the Git HEAD contract: %s', (_name, open) => {
  const { git, committed, empty } = open();

  test('a repository with a commit gives its abbreviated hash', () => {
    const head = git.readHeadCommit(committed);
    expect('text' in head && head.text).toMatch(/^[0-9a-f]{7,40}$/u);
  });

  test('a repository with no commit is a failure', () => {
    expect('failure' in git.readHeadCommit(empty)).toBe(true);
  });
});
