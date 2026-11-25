import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';

const scratchDirectories = removeScratchDirectoriesAfterEach();
const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;
const repository = new URL('../../../../', import.meta.url).pathname;

/**
 * Whether running the source entrypoint with `args` in this repository loads the TypeScript
 * compiler: a preloaded probe writes, as the process exits, whether any loaded module is the
 * compiler's.
 */
function loadsCompiler(args: readonly string[]): boolean {
  const directory = scratchDirectories.createDirectory('puni-compiler-');
  const probe = join(directory, 'probe.ts');
  const out = join(directory, 'loaded.txt');
  writeFileSync(
    probe,
    `process.on('exit', () => {\n  const loaded = Object.keys(require.cache).some((path) => /typescript\\/lib\\/typescript\\.js$/u.test(path));\n  require('node:fs').writeFileSync(${JSON.stringify(out)}, String(loaded));\n});\n`,
  );
  const child = Bun.spawnSync([process.execPath, '--preload', probe, entrypoint, ...args], {
    cwd: repository,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  if (child.exitCode !== 0) throw new Error(`puni ${args.join(' ')}: ${child.stderr.toString()}`);
  return readFileSync(out, 'utf8') === 'true';
}

describe('the TypeScript compiler', () => {
  test.each([[['--version']], [['burokrat', 'wiki', 'map']]])(
    'is not loaded by puni %j',
    (args) => {
      expect(loadsCompiler(args)).toBe(false);
    },
  );

  test('is loaded by a check that reads source files', () => {
    expect(loadsCompiler(['burokrat', 'check'])).toBe(true);
  });
});
