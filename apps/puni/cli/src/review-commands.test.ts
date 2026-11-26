import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { removeFixture, runGit, writeRepositoryFile } from '@puni/shared-testing';
import { type InProcessPuni, openInProcessPuni } from './in-process.test-host';
import { makeStateRepository } from './repository.test-host';

let puni: InProcessPuni;
let root: string;
let records: string;
let state: string;

beforeAll(() => {
  puni = openInProcessPuni();
});
afterAll(async () => {
  await puni.close();
});
beforeEach(() => {
  root = makeStateRepository();
  runGit(root, ['add', '-A']);
  runGit(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'state']);
  records = join(dirname(root), 'demo-records');
  state = join(dirname(root), 'review.json');
  mkdirSync(records);
  writeFileSync(join(records, 'AGENTS.md'), '# records\n');
  symlinkSync('AGENTS.md', join(records, 'CLAUDE.md'));
  runGit(records, ['init', '-q']);
});
afterEach(() => {
  removeFixture(root);
});

function input(name: string, value: unknown): string {
  const path = join(dirname(root), name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

const candidate = {
  title: 'Explain timeouts',
  criteria: ['clarity'],
  evidence: ['apps/one/src/index.ts:1'],
  improvement: 'State what a timeout means.',
};
const adHoc = {
  subject: 'Agent-facing diagnostics',
  instruction: 'Check command failures.',
  criteria: [{ id: 'clarity', goal: 'Make diagnostics actionable.' }],
};

function start(request: unknown) {
  return puni.run(
    ['burokrat', 'review', 'start', '--request', input('request.json', request), '--state', state],
    root,
  );
}
function submit(response: unknown) {
  return puni.run(
    ['burokrat', 'review', 'submit', '--state', state, '--result', input('result.json', response)],
    root,
  );
}
function file(title: string) {
  return puni.run(
    [
      'burokrat',
      'review',
      'file',
      '--state',
      state,
      '--title',
      title,
      '--topics',
      'review',
      '--summary',
      'Check diagnostics.',
    ],
    root,
  );
}

test('files the scored union of fresh passes and prints highest impact first', () => {
  const first = start(adHoc);
  expect(first.stderr).toBe('');
  const recovered = puni.run(['burokrat', 'review', 'next', '--state', state], root);
  expect(recovered.code).toBe(0);
  expect(JSON.parse(recovered.stdout)).toEqual(JSON.parse(first.stdout));
  expect(start(adHoc).code).toBe(2);
  expect(JSON.parse(first.stdout)).toMatchObject({ kind: 'discover', run: 1, ...adHoc });
  expect(
    JSON.parse(submit({ kind: 'discover', run: 1, candidates: [candidate] }).stdout),
  ).toMatchObject({ kind: 'compare', pool: [] });
  const second = JSON.parse(submit({ kind: 'compare', run: 1, duplicates: [] }).stdout) as Record<
    string,
    unknown
  >;
  expect(second).toEqual({ ...(JSON.parse(first.stdout) as object), run: 2 });
  const higher = {
    ...candidate,
    title: 'Name the failed command',
    improvement: 'Print the failed subcommand.',
  };
  submit({
    kind: 'discover',
    run: 2,
    candidates: [{ ...candidate, title: 'Timeout messages lack context' }, higher],
  });
  const third = submit({ kind: 'compare', run: 2, duplicates: [{ candidate: 1, of: 'f-1' }] });
  expect(JSON.parse(third.stdout)).toMatchObject({ kind: 'discover', run: 3 });
  submit({ kind: 'discover', run: 3, candidates: [higher] });
  expect(
    JSON.parse(
      submit({ kind: 'compare', run: 3, duplicates: [{ candidate: 1, of: 'f-2' }] }).stdout,
    ),
  ).toMatchObject({
    kind: 'score',
    findings: [
      { id: 'f-1', title: candidate.title },
      { id: 'f-2', title: higher.title },
    ],
  });
  const unscored = file('Diagnostic review');
  expect(unscored.code).toBe(2);
  expect(
    submit({
      kind: 'score',
      scores: [{ id: 'f-1', impact: 2, rationale: 'Improves infrequent timeouts.' }],
    }).code,
  ).toBe(2);
  expect(
    JSON.parse(
      submit({
        kind: 'score',
        scores: [
          { id: 'f-1', impact: 2, rationale: 'Improves infrequent timeouts.' },
          { id: 'f-2', impact: 9, rationale: 'Makes common failures actionable.' },
        ],
      }).stdout,
    ),
  ).toMatchObject({ kind: 'complete' });
  const filed = file('Diagnostic review');
  expect(filed.stderr).toBe('');
  expect(filed.code).toBe(0);
  const [path = '', high, low] = filed.stdout.trimEnd().split('\n');
  expect(path).toMatch(/^bur\/findings\//u);
  expect([high, low]).toEqual(['9/10 f-2 Name the failed command', '2/10 f-1 Explain timeouts']);
  const text = readFileSync(join(records, path), 'utf8');
  expect(text).toContain('no-new-findings');
  expect(text.indexOf(higher.title)).toBeLessThan(text.indexOf(candidate.title));
  expect(puni.run(['burokrat', 'check', '--repo', 'system-records'], root).code).toBe(0);
  expect(file('Diagnostic review').code).toBe(2);
});

test('an empty first pass gets a fresh confirmation', () => {
  start(adHoc);
  expect(JSON.parse(submit({ kind: 'discover', run: 1, candidates: [] }).stdout)).toMatchObject({
    kind: 'discover',
    run: 2,
  });
  expect(JSON.parse(submit({ kind: 'discover', run: 2, candidates: [] }).stdout)).toMatchObject({
    kind: 'complete',
  });
  expect(file('Empty review').stdout).toContain('No findings.');
});

test('lists local criteria maps and copies the chosen template into a record at the run limit', () => {
  writeRepositoryFile(
    root,
    'puni-assessments/diagnostics/1.json',
    JSON.stringify({ criteria: adHoc.criteria }),
  );
  writeRepositoryFile(
    root,
    'puni-assessments/diagnostics/2.json',
    JSON.stringify({ criteria: [{ id: 'actionable', goal: 'Name the next step.' }] }),
  );
  const listed = puni.run(['burokrat', 'assess', 'templates', '--json'], root);
  expect(listed.stderr).toBe('');
  expect(JSON.parse(listed.stdout)).toContainEqual({ id: 'diagnostics', version: '1' });
  const begin = start({
    subject: 'Diagnostics',
    instruction: 'Check errors.',
    template: { id: 'diagnostics', version: '1' },
    maxRuns: 1,
  });
  expect(JSON.parse(begin.stdout)).toMatchObject({ criteria: adHoc.criteria });
  submit({ kind: 'discover', run: 1, candidates: [candidate] });
  expect(JSON.parse(submit({ kind: 'compare', run: 1, duplicates: [] }).stdout)).toMatchObject({
    kind: 'score',
  });
  expect(
    submit({
      kind: 'score',
      scores: [{ id: 'f-1', impact: 4, rationale: 'More precise timeout messages.' }],
    }).code,
  ).toBe(0);
  const filed = file('Diagnostic assessment');
  expect(filed.code).toBe(0);
  const [path = ''] = filed.stdout.split('\n');
  expect(path).toMatch(/^bur\/assessment-reviews\//u);
  const body = readFileSync(join(records, path), 'utf8');
  expect(body).toContain('run-limit');
  expect(body).toContain('Make diagnostics actionable.');
  expect(puni.run(['burokrat', 'check', '--repo', 'system-records'], root).code).toBe(0);
});

test('default allows five discovery runs, then scores even when the last adds a finding', () => {
  start(adHoc);
  for (let run = 1; run <= 5; run++) {
    submit({
      kind: 'discover',
      run,
      candidates: [{ ...candidate, title: `Candidate ${String(run)}` }],
    });
    const next = submit({ kind: 'compare', run, duplicates: [] });
    expect(JSON.parse(next.stdout)).toMatchObject(
      run === 5 ? { kind: 'score' } : { kind: 'discover', run: run + 1 },
    );
  }
});

test('a working tree review refuses a changed snapshot rather than mixing evidence', () => {
  writeRepositoryFile(root, 'local.txt', 'First');
  const first = start({ ...adHoc, workingTree: true });
  const task = JSON.parse(first.stdout) as { readonly snapshot: string };
  expect(task.snapshot).toMatch(/^[a-f\d]{64}$/u);
  writeRepositoryFile(root, 'local.txt', 'Second');
  const next = submit({ kind: 'discover', run: 1, candidates: [] });
  expect(next.code).toBe(1);
  expect(next.stderr).toContain('working tree changed');
});

test('working tree verification detects tracked edits hidden by assume-unchanged', () => {
  writeRepositoryFile(root, 'tracked.txt', 'First');
  runGit(root, ['add', 'tracked.txt']);
  runGit(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'tracked']);
  runGit(root, ['update-index', '--assume-unchanged', 'tracked.txt']);
  expect(start({ ...adHoc, workingTree: true }).code).toBe(0);
  writeRepositoryFile(root, 'tracked.txt', 'Second');
  const next = submit({ kind: 'discover', run: 1, candidates: [] });
  expect([next.code, next.stderr]).toEqual([
    1,
    'error: the working tree changed since the review started; start a new review of the current snapshot\n',
  ]);
});

test('a supplied run cap or working tree setting must have its declared type', () => {
  expect(start({ ...adHoc, maxRuns: null }).stderr).toBe(
    'error: maxRuns must be a positive integer\n',
  );
  expect(start({ ...adHoc, workingTree: null }).stderr).toBe(
    'error: workingTree must be true or false\n',
  );
});
