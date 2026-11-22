import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cliPackage from '../package.json' with { type: 'json' };

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(
  args: readonly string[],
  cwd = process.cwd(),
): { code: number; stdout: string; stderr: string } {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    cwd,
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

  test.each(['nav stray', '--bogus', 'b --bogus', 'b wiki nope', 'b wiki index --check'])(
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

  test('burokrat check passes against this repository', () => {
    const run = runPuni(['burokrat', 'check']);
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(/^ok: code, \d+ rules, no findings\.\n$/u);
    expect(run.code).toBe(0);
  });

  describe('against a records repository', () => {
    let root = '';
    const first = 'nav/plans/2031-04-05-first-plan.md';
    const second = 'nav/plans/2031-04-06-second-plan.md';

    function writeRecord(path: string, date: string, link: string): void {
      const lines = [
        '---',
        'kind: plan',
        'title: A plan',
        `date: ${date}`,
        'commit: abc1234',
        'topics: planning',
        'summary: A plan the entrypoint test files.',
        link,
        '---',
        '',
      ];
      writeFileSync(join(root, path), lines.join('\n'));
    }

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'puni-entrypoint-records-'));
      writeFileSync(join(root, 'puni.json'), JSON.stringify({ 'puni-repo-kind': 'records' }));
      writeFileSync(join(root, 'AGENTS.md'), '# records\n');
      symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
      mkdirSync(join(root, 'nav/plans'), { recursive: true });
      writeRecord(first, '2031-04-05', `superseded-by: ${second}`);
      writeRecord(second, '2031-04-06', `supersedes: ${first}`);
      const init = Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
      if (init.exitCode !== 0) throw new Error(`git init failed in ${root}`);
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    test('two valid records, one superseding the other, pass with exit 0', () => {
      expect(runPuni(['burokrat', 'check'], root)).toEqual({
        code: 0,
        stdout: 'ok: records, 8 rules, no findings.\n',
        stderr: '',
      });
    });

    test('a record without front matter fails with exit 1 and its finding', () => {
      writeFileSync(join(root, 'nav/plans/2031-04-07-bare.md'), '# bare\n');
      const run = runPuni(['burokrat', 'check'], root);
      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(
        /^records\.front-matter nav\/plans\/2031-04-07-bare\.md: does not open with front matter[^\n]*\nfail: records, 8 rules, 1 finding\.\n$/u,
      );
    });
  });
});
