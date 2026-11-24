import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(args: readonly string[], cwd: string) {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return { code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

describe('navigator plan add through the entrypoint, demo beside demo-records', () => {
  let state = '';
  let records = '';

  beforeEach(() => {
    state = makeStateRepository(scratchDirectories);
    runGit(state, ['add', '-A']);
    runGit(state, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'state']);
    records = join(dirname(state), 'demo-records');
    mkdirSync(records);
    writeFileSync(join(records, 'AGENTS.md'), '# records\n');
    symlinkSync('AGENTS.md', join(records, 'CLAUDE.md'));
    runGit(records, ['init', '-q']);
    writeFileSync(join(state, 'body.md'), '# First plan\n\nStart with one node.\n');
  });

  const add = [
    'navigator',
    'plan',
    'add',
    '--title',
    'First plan',
    '--topics',
    'ops,k3s',
    '--summary',
    'Start the cluster on one node.',
  ];

  test('files a plan that check --repo system-records passes, and refuses to overwrite it', () => {
    const today = new Date().toISOString().slice(0, 10);
    const path = `nav/plans/${today}-first-plan.md`;
    expect(runPuni([...add, '--body-file', 'body.md'], state)).toEqual({
      code: 0,
      stdout: `${path}\n`,
      stderr: '',
    });
    const head = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: state });
    expect(readFileSync(join(records, path), 'utf8')).toBe(
      [
        '---',
        'kind: plan',
        'title: First plan',
        `date: ${today}`,
        `commit: ${head.stdout.toString().trim()}`,
        'topics: ops, k3s',
        'summary: Start the cluster on one node.',
        '---',
        '',
        '# First plan',
        '',
        'Start with one node.',
        '',
      ].join('\n'),
    );
    expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-records, 12 rules, no findings.\n',
      stderr: '',
    });
    const again = runPuni(add, state);
    expect([again.code, again.stdout]).toEqual([2, '']);
    expect(again.stderr).toBe(
      `error: ${path} already exists in the records repository; a record is never overwritten, so give another title or wait a day\n`,
    );
  });

  test('a missing option is a usage refusal, exit 2', () => {
    const run = runPuni(add.slice(0, -2), state);
    expect([run.code, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toMatch(/^error: [^\n]*--summary[^\n]*\n$/u);
  });
});
