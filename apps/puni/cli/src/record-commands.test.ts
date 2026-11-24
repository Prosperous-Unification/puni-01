import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';
import { type InProcessPuni, openInProcessPuni } from './in-process.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let puni: InProcessPuni;

beforeAll(() => {
  puni = openInProcessPuni();
});

afterAll(async () => {
  await puni.close();
});

function runPuni(args: readonly string[], cwd: string) {
  return puni.run(args, cwd);
}

const options = ['--title', 'First note', '--topics', 'ops,k3s', '--summary', 'Start small.'];

describe.each([
  ['navigator research add', 'nav/research', 'research', '# First note\n'],
  [
    'dash run log',
    'bur/assessments',
    'assessment',
    '# First note\n\n## Command\n\n## Outcome\n\n## Evidence\n',
  ],
  [
    'burokrat adr add',
    'bur/adr',
    'adr',
    '# First note\n\n## Decision\n\n## Why\n\n## Options rejected\n',
  ],
] as const)('%s in process, demo beside demo-records', (line, directory, kind, body) => {
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
  });

  test(`files a record of kind ${kind} that check --repo system-records passes, and refuses to overwrite it`, () => {
    const today = new Date().toISOString().slice(0, 10);
    const path = `${directory}/${today}-first-note.md`;
    const add = [...line.split(' '), ...options];
    expect(runPuni(add, state)).toEqual({ code: 0, stdout: `${path}\n`, stderr: '' });
    const head = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: state });
    expect(readFileSync(join(records, path), 'utf8')).toBe(
      `---\nkind: ${kind}\ntitle: First note\ndate: ${today}\ncommit: ${head.stdout.toString().trim()}\ntopics: ops, k3s\nsummary: Start small.\n---\n\n${body}`,
    );
    expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-records, 13 rules, no findings.\n',
      stderr: '',
    });
    expect(runPuni(add, state)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: ${path} already exists in the records repository; a record is never overwritten, so give another title or wait a day\n`,
    });
  });

  test('bad topics are refused in one line, exit 2', () => {
    const add = [
      ...line.split(' '),
      ...options.slice(0, 2),
      '--topics',
      'Ops',
      ...options.slice(4),
    ];
    const run = runPuni(add, state);
    expect([run.code, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toStartWith('error: topics has invalid entries ["Ops"]; ');
  });
});
