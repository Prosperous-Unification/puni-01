import { describe, expect, test } from 'bun:test';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';

const root = new URL('../', import.meta.url).pathname;

const scratchDirectories = removeScratchDirectoriesAfterEach();

/** Every command the `SessionStart` hooks of `.claude/settings.json` run. */
function listSessionStartCommands(): string[] {
  const settings: unknown = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const groups = (settings as { hooks?: { SessionStart?: unknown } }).hooks?.SessionStart;
  if (!Array.isArray(groups)) throw new Error('.claude/settings.json has no SessionStart hooks');
  return groups.flatMap((group: { hooks?: { command?: unknown }[] }) =>
    (group.hooks ?? []).map((hook) => String(hook.command)),
  );
}

const quiet = { CLAUDECODE: '0', AGENT: '0' };

/** This process's environment without `FORCE_COLOR`, which Nx sets and a session does not. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'FORCE_COLOR'),
);

/** Runs the one hook command from the temporary directory, the project at `project`. */
function runHook(project: string) {
  const [command = ''] = listSessionStartCommands();
  const hook = Bun.spawnSync(['sh', '-c', command], {
    cwd: tmpdir(),
    env: { ...environment, ...quiet, CLAUDE_PROJECT_DIR: project },
  });
  return { code: hook.exitCode, stdout: hook.stdout.toString(), stderr: hook.stderr.toString() };
}

/** The line the hook prints when it cannot print the map. */
const fallback =
  'The wiki map could not be printed: if a package is missing run bun install; otherwise fix what the error above names, then run bun run puni burokrat wiki map.\n';

/**
 * Claude Code adds what a `SessionStart` hook prints to the session's context, so every session
 * here starts with the root of the map, or with what stopped it and how to fix that. The hook
 * runs from wherever the session starts, with `CLAUDE_PROJECT_DIR` naming the repository.
 */
describe('the SessionStart hook', () => {
  test('is the one hook, and prints exactly the root of the map from any directory', () => {
    expect(listSessionStartCommands()).toHaveLength(1);
    const map = Bun.spawnSync(
      ['bun', 'apps/puni/cli/src/entrypoint.ts', 'burokrat', 'wiki', 'map'],
      { cwd: root, env: { ...environment, ...quiet } },
    );
    expect(map.exitCode).toBe(0);
    const hook = runHook(root);
    expect(hook).toEqual({ code: 0, stdout: map.stdout.toString(), stderr: '' });
    expect(hook.stdout).toStartWith('# Wiki map\n');
  });

  /**
   * A checkout without `node_modules`: `bunfig.toml` disables Bun's auto-install, so the run
   * names the missing package instead of fetching it, and the hook says how to fix that.
   */
  test('without installed packages prints the failure and how to fix it, installing nothing', () => {
    const copy = scratchDirectories.createDirectory('puni-hook-');
    const listed = Bun.spawnSync(
      ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      {
        cwd: root,
      },
    );
    for (const path of listed.stdout.toString().split('\0')) {
      if (path !== '') cpSync(join(root, path), join(copy, path), { force: true });
    }
    const hook = runHook(copy);
    expect([hook.code, hook.stderr]).toEqual([0, '']);
    expect(hook.stdout).toMatch(/^error: Cannot find (package|module) '/u);
    expect(hook.stdout).toEndWith(fallback);
    expect(existsSync(join(copy, 'node_modules'))).toBe(false);
  });
});
