import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';

const scratch = removeScratchDirectoriesAfterEach();

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(args: readonly string[], cwd: string) {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return { code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

describe('dash resources through the entrypoint, in a committed demo repository', () => {
  let state = '';

  beforeEach(() => {
    state = makeStateRepository(scratch);
    writeFileSync(join(state, '.gitignore'), '.worktrees/\n');
    runGit(state, ['add', '-A']);
    runGit(state, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'state']);
  });

  test('create, list, exec with its output and exit code passed through, refused and forced remove', () => {
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
      runPuni(['d', 'resources', 'exec', 'probe', '--', 'git', 'status', '--short'], state),
    ).toEqual({ code: 0, stdout: '?? draft.md\n', stderr: '' });
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
