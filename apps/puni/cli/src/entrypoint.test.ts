import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import cliPackage from '../package.json' with { type: 'json' };
import { makeStateRepository } from './repository.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

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

  test.each(['nav stray', '--bogus', 'b --bogus', 'b wiki nope', 'b wiki map --check'])(
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
    expect(run.stdout).toContain('Usage: puni navigator [(plan ');
  });

  test('--version prints the version line and exits 0', () => {
    expect(runPuni(['--version'])).toEqual({
      code: 0,
      stdout: `${cliPackage.version}\n`,
      stderr: '',
    });
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

    beforeEach(() => {
      state = makeStateRepository(scratchDirectories);
      parent = dirname(state);
      records = join(parent, 'demo-records');
      mkdirSync(join(records, 'nav/plans'), { recursive: true });
      writeFileSync(join(records, 'AGENTS.md'), '# records\n');
      symlinkSync('AGENTS.md', join(records, 'CLAUDE.md'));
      writeRecord(first, '2031-04-05', `superseded-by: ${second}`);
      writeRecord(second, '2031-04-06', `supersedes: ${first}`);
      runGit(records, ['init', '-q']);
    });

    test('check --repo system-records passes two records, one superseding the other', () => {
      expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
        code: 0,
        stdout: 'ok: system-records, 10 rules, no findings.\n',
        stderr: '',
      });
    });

    test('check --repo system-records reports a record without front matter, exit 1', () => {
      writeFileSync(join(records, 'nav/plans/2031-04-07-bare.md'), '# bare\n');
      const run = runPuni(['burokrat', 'check', '--repo', 'system-records'], state);
      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(
        /^records\.front-matter nav\/plans\/2031-04-07-bare\.md: does not open with front matter[^\n]*\nfail: system-records, 10 rules, 1 finding\.\n$/u,
      );
    });

    test('check from inside the records checkout is repository.root with the hint, exit 1', () => {
      expect(runPuni(['burokrat', 'check'], records)).toEqual({
        code: 1,
        stdout: `repository.root .: no puni.json in ${records} or any directory above it; run puni from the system-state repository, which holds puni.json; fix: run puni from the system-state repository or a directory in it\nfail: no repository, 1 finding.\n`,
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
      let ownReports = '';
      const line = /^error: unexpected failure, reference (\S+), report (\S+)\n$/u;
      const token = ['sk', 'live', 'x9'.repeat(12)].join('-');

      beforeEach(() => {
        reports = join(parent, 'tmp');
        ownReports = join(reports, `puni-failures-${String(userInfo().uid)}`);
        mkdirSync(reports);
        mkdirSync(join(state, 'locked'));
        writeFileSync(join(state, 'locked/inside.md'), 'a tracked file nobody may describe\n');
        runGit(state, ['add', 'locked']);
        chmodSync(join(state, 'locked'), 0o000);
      });

      afterEach(() => {
        if (existsSync(join(state, 'locked'))) chmodSync(join(state, 'locked'), 0o700);
      });

      test('exits 3 with one error line naming the reference and a private report file', () => {
        const run = runPuni(['burokrat', 'check', '--project', token], state, { TMPDIR: reports });
        expect([run.code, run.stdout]).toEqual([3, '']);
        const [, reference = '', path = ''] = line.exec(run.stderr) ?? [];
        expect(path).toBe(join(ownReports, `${reference}.json`));
        const text = readFileSync(path, 'utf8');
        const report: unknown = JSON.parse(text);
        expect(report).toMatchObject({ occurrence_id: reference, v: 'corj/v0.15' });
        expect(report).toHaveProperty('context', { command: 'burokrat check' });
        expect(text).toContain('EACCES');
        expect(text).not.toContain(token);
        expect(statSync(ownReports).mode & 0o777).toBe(0o700);
        expect(statSync(path).mode & 0o777).toBe(0o600);
      });

      test('a report directory others can open is not written to', () => {
        mkdirSync(ownReports, { mode: 0o755 });
        chmodSync(ownReports, 0o755);
        const run = runPuni(['burokrat', 'check'], state, { TMPDIR: reports });
        expect(run.code).toBe(3);
        expect(run.stderr).toMatch(
          /^error: unexpected failure, reference \S+, report lost: \S+ is not a directory only this user can open\n$/u,
        );
        expect(readdirSync(ownReports)).toEqual([]);
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
        expect(existsSync(ownReports)).toBe(false);
      });

      test('a report that cannot be written is named lost, still with exit 3', () => {
        writeFileSync(ownReports, 'a file where the directory belongs');
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
        const [written = ''] = readdirSync(ownReports);
        expect(readFileSync(join(ownReports, written), 'utf8')).toContain('main failed to load');
      });

      test('an error whose message and stack are getters is reported with its name, message and stack, redacted', () => {
        const preload = join(parent, 'getter-error.ts');
        const main = [
          'class Hidden extends Error {',
          '  constructor() { super(); Reflect.deleteProperty(this, "stack"); }',
          `  get message() { return 'module x not found, ${token}'; }`,
          "  get stack() { return 'Hidden: module x not found\\n    at hidden.ts:1:1'; }",
          '}',
          "Object.defineProperty(Hidden.prototype, 'name', { value: 'Hidden' });",
          'export async function runProcess() { throw new Hidden(); }',
        ].join('\n');
        writeFileSync(
          preload,
          [
            "import { plugin } from 'bun';",
            'plugin({',
            "  name: 'getter-error',",
            '  setup(build) {',
            `    build.onLoad({ filter: /[\\/]main\\.ts$/ }, () => ({ loader: 'ts', contents: ${JSON.stringify(main)} }));`,
            '  },',
            '});',
            '',
          ].join('\n'),
        );
        const run = runPuni(['--version'], state, { TMPDIR: reports }, ['--preload', preload]);
        expect([run.code, run.stdout]).toEqual([3, '']);
        expect(run.stderr).toMatch(line);
        const [written = ''] = readdirSync(ownReports);
        const text = readFileSync(join(ownReports, written), 'utf8');
        expect(JSON.parse(text)).toMatchObject({
          message: 'module x not found, [redacted]',
          as_json: { name: 'Hidden' },
          stack: ['Hidden: module x not found', '    at hidden.ts:1:1'],
        });
        expect(text).toContain('"constructor_name":"Hidden"');
        expect(text).not.toContain(token);
      });

      test.each([
        ['an unhandled rejection', 'void Promise.reject(new Error("stray failure"));'],
        ['an uncaught exception', 'throw new Error("stray failure");'],
      ])('%s outside the awaited path is reported the same way', (_name, stray) => {
        const preload = join(parent, 'stray.ts');
        const main = `export async function runProcess() { setTimeout(() => { ${stray} }, 0); }`;
        writeFileSync(
          preload,
          [
            "import { plugin } from 'bun';",
            'plugin({',
            "  name: 'stray-failure',",
            '  setup(build) {',
            `    build.onLoad({ filter: /[\\/]main\\.ts$/ }, () => ({ loader: 'ts', contents: ${JSON.stringify(main)} }));`,
            '  },',
            '});',
            '',
          ].join('\n'),
        );
        const run = runPuni(['--version'], state, { TMPDIR: reports }, ['--preload', preload]);
        expect([run.code, run.stdout]).toEqual([3, '']);
        expect(run.stderr).toMatch(line);
        const [written = ''] = readdirSync(ownReports);
        expect(readFileSync(join(ownReports, written), 'utf8')).toContain('stray failure');
      });
    });

    describe('a git that cannot list the checkout', () => {
      const breaks: readonly (readonly [string, () => Readonly<Record<string, string>>])[] = [
        [
          'no repository',
          () => {
            rmSync(join(state, '.git'), { recursive: true });
            mkdirSync(join(state, '.git'));
            return {};
          },
        ],
        [
          'a corrupt index',
          () => {
            runGit(state, ['add', '-A']);
            writeFileSync(join(state, '.git/index'), 'not an index');
            return {};
          },
        ],
        ['git missing from PATH', () => ({ PATH: join(parent, 'no-tools') })],
      ];

      test.each(breaks)('%s: check is one repository.git finding, exit 1', (_name, breakGit) => {
        const run = runPuni(['burokrat', 'check'], state, breakGit());
        expect([run.code, run.stderr]).toEqual([1, '']);
        expect(run.stdout).toMatch(
          /^repository\.git \.: git [^\n]+; fix: make `git ls-files` succeed[^\n]+\nfail: system-state, \d+ rules, 1 finding\.\n$/u,
        );
      });

      test.each(breaks)('%s: wiki map is one error line, exit 1', (_name, breakGit) => {
        const run = runPuni(['burokrat', 'wiki', 'map'], state, breakGit());
        expect([run.code, run.stdout]).toEqual([1, '']);
        expect(run.stderr).toMatch(/^error: git [^\n]+\n$/u);
      });
    });

    test('wiki map prints the map of the system-state repository through the registry', () => {
      expect(runPuni(['burokrat', 'wiki', 'map'], join(state, 'apps'))).toEqual({
        code: 0,
        stdout: '# Wiki map\n\n## Partitions\n\n- changing the app: `puni burokrat wiki map app`\n',
        stderr: '',
      });
      expect(runPuni(['b', 'wiki', 'map', 'app'], state)).toEqual({
        code: 0,
        stdout:
          '# Wiki map: app\n\nRead this when changing the app.\n\n## Read when\n\n- changing one: [one](apps/one/src/index.ts)\n',
        stderr: '',
      });
      expect(runPuni(['b', 'wiki', 'map', 'dash'], state)).toEqual({
        code: 2,
        stdout: '',
        stderr:
          'error: the map has no section or partition "dash"; its sections: none; its partitions: app\n',
      });
    });
  });
});
