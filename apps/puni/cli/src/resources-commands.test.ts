import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeFixture, runGit } from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';
import { type InProcessPuni, openInProcessPuni } from './in-process.test-host';

let puni: InProcessPuni;

beforeAll(() => {
  puni = openInProcessPuni();
});

afterAll(async () => {
  await puni.close();
});

function runPuni(args: readonly string[], cwd: string) {
  return puni.run(args, cwd);
}

describe('dash resources in process, in a committed demo repository', () => {
  let state = '';

  beforeEach(() => {
    state = makeStateRepository();
    writeFileSync(join(state, '.gitignore'), '.worktrees/\n');
    runGit(state, ['add', '-A']);
    runGit(state, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'state']);
  });

  afterEach(() => {
    removeFixture(state);
  });

  test('create, list, exec in the worktree with its exit code passed through, refused and forced remove', () => {
    const probe = join(state, '.worktrees/probe');
    expect(runPuni(['dash', 'resources', 'create', '--name', 'probe'], state)).toEqual({
      code: 0,
      stdout: `${probe}\n`,
      stderr: '',
    });
    expect(runPuni(['d', 'resources', 'list'], state)).toEqual({
      code: 0,
      stdout: 'probe resources/probe clean\n',
      stderr: '',
    });
    writeFileSync(join(probe, 'draft.md'), 'work');
    expect(
      runPuni(['d', 'resources', 'exec', 'probe', '--', 'test', '-e', 'draft.md'], state),
    ).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(runPuni(['d', 'resources', 'exec', 'probe', 'sh', '-c', 'exit 5'], state).code).toBe(5);
    expect(runPuni(['d', 'resources', 'remove', 'probe'], state)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: resource probe is not removed: ${probe} has uncommitted changes; keep that work first, or pass --force to discard it\n`,
    });
    expect(runPuni(['d', 'resources', 'remove', 'probe', '--force'], state)).toEqual({
      code: 0,
      stdout: 'removed probe\n',
      stderr: '',
    });
    expect(existsSync(probe)).toBe(false);
  });

  test('remove --help says --force is the destructive path', () => {
    const help = runPuni(['d', 'resources', 'remove', '--help'], state);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('--force');
    expect(help.stdout).toContain('Destructive');
  });
});
