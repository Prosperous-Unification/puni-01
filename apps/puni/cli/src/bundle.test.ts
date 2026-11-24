import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import cliPackage from '../package.json' with { type: 'json' };

const scratch = removeScratchDirectoriesAfterEach();

/**
 * The file the `build` target writes. The `test` target depends on `build`, so under Nx this is
 * the bundle of the source under test; run alone, the test refuses a missing bundle.
 */
const bundle = new URL('../../../../dist/apps/puni/cli/puni.js', import.meta.url).pathname;
const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(args: readonly string[], cwd: string, program = bundle) {
  const child = Bun.spawnSync([process.execPath, program, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return { code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

describe('the built puni.js', () => {
  let parent = '';

  beforeEach(() => {
    if (!existsSync(bundle)) {
      throw new Error(`${bundle} is missing; run bunx nx run puni-cli:build`);
    }
    parent = scratch.createDirectory('puni-bundle-');
  });

  test('prints its version', () => {
    expect(runPuni(['--version'], parent)).toEqual({
      code: 0,
      stdout: `${cliPackage.version}\n`,
      stderr: '',
    });
  });

  test('prints the help of burokrat check as the source entrypoint does', () => {
    const run = runPuni(['burokrat', 'check', '--help'], parent);
    expect([run.code, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('--cross-project-links');
    expect(run).toEqual(runPuni(['burokrat', 'check', '--help'], parent, entrypoint));
  });

  test('creates a repository pair with repo init that both checks pass', () => {
    const state = join(parent, 'shop');
    mkdirSync(state);
    const init = runPuni(['burokrat', 'repo', 'init', '--name', 'shop', '--owner', 'acme'], state);
    expect([init.code, init.stderr]).toEqual([0, '']);
    runGit(state, ['init', '-q']);
    runGit(join(parent, 'shop-records'), ['init', '-q']);
    expect(runPuni(['burokrat', 'check'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-state, 24 rules, no findings.\n',
      stderr: '',
    });
    expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-records, 10 rules, no findings.\n',
      stderr: '',
    });
  });
});
