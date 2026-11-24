import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { createBunGit } from './bun-git.repository';
import { createBunProcessRunner } from './bun-process-runner.repository';

describe('createBunProcessRunner', () => {
  test('a program that cannot start is unstarted, not an exit', () => {
    expect(createBunProcessRunner().run(['puni-no-such-program'], { cwd: tmpdir() }).kind).toBe(
      'unstarted',
    );
  });
});

describe('createBunGit', () => {
  test('a git that cannot start is a failure', () => {
    const unstarted = createBunGit({
      processRunner: {
        run: () => ({ kind: 'unstarted', reason: 'no git' }),
        runAttached: () => ({ kind: 'unstarted', reason: 'no git' }),
      },
    });
    expect(unstarted.listVisibleFiles(tmpdir())).toEqual({ failure: 'git could not run: no git' });
  });
});
