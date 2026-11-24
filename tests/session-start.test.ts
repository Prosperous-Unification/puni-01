import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;

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

/**
 * Claude Code adds what a `SessionStart` hook prints to the session's context, so every session
 * here starts with the root of the map. The hook runs from wherever the session starts, with
 * `CLAUDE_PROJECT_DIR` naming the repository.
 */
test('the one SessionStart hook prints exactly the root of the map, from any directory', () => {
  const commands = listSessionStartCommands();
  expect(commands).toEqual(['cd "$CLAUDE_PROJECT_DIR" && bun run --silent puni burokrat wiki map']);
  const hook = Bun.spawnSync(['sh', '-c', commands[0] ?? ''], {
    cwd: tmpdir(),
    env: { ...process.env, ...quiet, CLAUDE_PROJECT_DIR: root },
  });
  const map = Bun.spawnSync(['bun', 'apps/puni/cli/src/entrypoint.ts', 'burokrat', 'wiki', 'map'], {
    cwd: root,
    env: { ...process.env, ...quiet },
  });
  expect([hook.exitCode, hook.stderr.toString()]).toEqual([0, '']);
  expect(map.exitCode).toBe(0);
  expect(hook.stdout.toString()).toStartWith('# Wiki map\n');
  expect(hook.stdout.toString()).toBe(map.stdout.toString());
});
