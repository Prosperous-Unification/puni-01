import { describe, expect, test } from 'bun:test';
import cliPackage from '../package.json' with { type: 'json' };

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return {
    code: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}

describe('entrypoint', () => {
  test('nope refuses with exit 2 and one error line', () => {
    expect(runPuni(['nope'])).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: Unexpected option or subcommand: `nope`.\n',
    });
  });

  test.each(['nav stray', '--bogus', 'b --bogus', 'b wiki nope'])(
    '%s refuses with exit 2 and one error line',
    (line) => {
      const run = runPuni(line.split(' '));
      expect(run.code).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(/^error: [^\n]+\n$/u);
    },
  );

  test('a bare group prints its help on stdout and exits 0', () => {
    const run = runPuni(['n']);
    expect(run).toEqual({ code: 0, stdout: runPuni(['navigator', '--help']).stdout, stderr: '' });
    expect(run.stdout).toContain('Usage: puni navigator\n');
  });

  test('--version prints the version line and exits 0', () => {
    expect(runPuni(['--version'])).toEqual({
      code: 0,
      stdout: `${cliPackage.version}\n`,
      stderr: '',
    });
  });

  test('burokrat wiki index --check passes against this repository', () => {
    expect(runPuni(['burokrat', 'wiki', 'index', '--check'])).toEqual({
      code: 0,
      stdout: 'wiki/index is current.\n',
      stderr: '',
    });
  });
});
