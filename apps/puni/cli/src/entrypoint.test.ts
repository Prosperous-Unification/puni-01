import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cliPackage from '../package.json' with { type: 'json' };

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(
  args: readonly string[],
  cwd = process.cwd(),
  env: Readonly<Record<string, string>> = {},
  runtimeArgs: readonly string[] = [],
): { code: number; stdout: string; stderr: string } {
  const child = Bun.spawnSync([process.execPath, ...runtimeArgs, entrypoint, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0', ...env },
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
    expect(run.stdout).toMatch(/^ok: system-state, \d+ rules, no findings\.\n$/u);
    expect(run.code).toBe(0);
  });

  describe('against a temporary project: demo (system-state) beside demo-records', () => {
    let parent = '';
    let state = '';
    let records = '';
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
      writeFileSync(join(records, path), lines.join('\n'));
    }

    function initGit(root: string): void {
      const init = Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
      if (init.exitCode !== 0) throw new Error(`git init failed in ${root}`);
    }

    beforeEach(() => {
      parent = mkdtempSync(join(tmpdir(), 'puni-entrypoint-pair-'));
      state = join(parent, 'demo');
      records = join(parent, 'demo-records');
      mkdirSync(join(state, 'apps/one/src'), { recursive: true });
      mkdirSync(join(state, 'libs'));
      writeFileSync(
        join(state, 'puni.json'),
        JSON.stringify({
          'this-repo-type': 'system-state',
          'all-repos': [
            {
              type: 'system-state',
              remote: { type: 'github', url: 'https://github.com/acme/demo' },
            },
            {
              type: 'system-records',
              remote: { type: 'github', url: 'https://github.com/acme/demo-records' },
            },
          ],
        }),
      );
      writeFileSync(join(state, 'apps/one/src/main.ts'), 'export {};\n');
      writeFileSync(
        join(state, 'apps/one/project.json'),
        JSON.stringify({
          name: 'one',
          metadata: { readWhen: 'changing one', readFirst: 'src/main.ts' },
        }),
      );
      initGit(state);
      mkdirSync(join(records, 'nav/plans'), { recursive: true });
      writeFileSync(join(records, 'AGENTS.md'), '# records\n');
      symlinkSync('AGENTS.md', join(records, 'CLAUDE.md'));
      writeRecord(first, '2031-04-05', `superseded-by: ${second}`);
      writeRecord(second, '2031-04-06', `supersedes: ${first}`);
      initGit(records);
    });

    afterEach(() => {
      rmSync(parent, { recursive: true, force: true });
    });

    test('check --repo system-records passes two records, one superseding the other', () => {
      expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
        code: 0,
        stdout: 'ok: system-records, 8 rules, no findings.\n',
        stderr: '',
      });
    });

    test('check --repo system-records reports a record without front matter, exit 1', () => {
      writeFileSync(join(records, 'nav/plans/2031-04-07-bare.md'), '# bare\n');
      const run = runPuni(['burokrat', 'check', '--repo', 'system-records'], state);
      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(
        /^records\.front-matter nav\/plans\/2031-04-07-bare\.md: does not open with front matter[^\n]*\nfail: system-records, 8 rules, 1 finding\.\n$/u,
      );
    });

    test('check from inside the records checkout is repository.root with the hint, exit 1', () => {
      expect(runPuni(['burokrat', 'check'], records)).toEqual({
        code: 1,
        stdout: `repository.root .: no puni.json in ${records} or any directory above it; run puni from the system-state repository, which holds puni.json\nfail: no repository, 1 finding.\n`,
        stderr: '',
      });
    });

    test.each([
      [
        ['--repo', 'system-records', '--project', 'one'],
        'error: --project needs the system-state repository; system-records is judged whole\n',
      ],
      [['--repo', 'system-docs'], /^error: [^\n]*system-docs[^\n]*\n$/u],
    ] as const)('check %j is refused with exit 2 and one error line', (args, stderr) => {
      const run = runPuni(['burokrat', 'check', ...args], state);
      expect(run.code).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(stderr);
    });

    describe('an unexpected failure', () => {
      let reports = '';
      const line = /^error: unexpected failure, reference (\S+), report (\S+)\n$/u;

      beforeEach(() => {
        reports = join(parent, 'tmp');
        mkdirSync(reports);
        mkdirSync(join(state, 'AGENTS.md'));
        writeFileSync(join(state, 'AGENTS.md/inside.md'), 'a directory where a file belongs\n');
      });

      test('exits 3 with one error line naming the reference and the report file', () => {
        const run = runPuni(['burokrat', 'check'], state, { TMPDIR: reports });
        expect([run.code, run.stdout]).toEqual([3, '']);
        const [, reference = '', path = ''] = line.exec(run.stderr) ?? [];
        expect(path).toBe(join(reports, 'puni-failures', `${reference}.json`));
        const report: unknown = JSON.parse(readFileSync(path, 'utf8'));
        expect(report).toMatchObject({ occurrence_id: reference, v: 'corj/v0.15' });
        expect(readFileSync(path, 'utf8')).toContain('EISDIR');
      });

      test('with PUNI_FAILURE_REPORT=stderr the report is printed above the error line instead', () => {
        const run = runPuni(['burokrat', 'check'], state, {
          TMPDIR: reports,
          PUNI_FAILURE_REPORT: 'stderr',
        });
        expect(run.code).toBe(3);
        const [report = '', error = '', ...rest] = run.stderr.split('\n');
        expect(rest).toEqual(['']);
        const [, reference = '', where = ''] = line.exec(`${error}\n`) ?? [];
        expect(where).toBe('above');
        expect(JSON.parse(report)).toMatchObject({ occurrence_id: reference });
        expect(existsSync(join(reports, 'puni-failures'))).toBe(false);
      });

      test('a report that cannot be written is named lost, still with exit 3', () => {
        writeFileSync(join(reports, 'puni-failures'), 'a file where the directory belongs');
        const run = runPuni(['burokrat', 'check'], state, { TMPDIR: reports });
        expect(run.code).toBe(3);
        expect(run.stderr).toMatch(
          /^error: unexpected failure, reference \S+, report lost: [^\n]*EEXIST[^\n]*\n$/u,
        );
      });

      test('a failure while importing main is reported the same way', () => {
        const preload = join(parent, 'break-main.ts');
        writeFileSync(
          preload,
          [
            "import { plugin } from 'bun';",
            'plugin({',
            "  name: 'break-main',",
            '  setup(build) {',
            '    build.onLoad({ filter: /[\\/]main\\.ts$/ }, () => {',
            "      throw new Error('main failed to load');",
            '    });',
            '  },',
            '});',
            '',
          ].join('\n'),
        );
        const run = runPuni(['--version'], state, { TMPDIR: reports }, ['--preload', preload]);
        expect([run.code, run.stdout]).toEqual([3, '']);
        expect(run.stderr).toMatch(line);
        const [written = ''] = readdirSync(join(reports, 'puni-failures'));
        expect(readFileSync(join(reports, 'puni-failures', written), 'utf8')).toContain(
          'main failed to load',
        );
      });
    });

    test('wiki index writes the system-state index through the registry', () => {
      expect(runPuni(['burokrat', 'wiki', 'index'], join(state, 'apps'))).toEqual({
        code: 0,
        stdout: 'wrote: wiki/index/index.md\n',
        stderr: '',
      });
    });
  });
});
