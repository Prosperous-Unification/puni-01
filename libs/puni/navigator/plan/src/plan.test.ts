import { describe, expect, test } from 'bun:test';
import { checkoutModule, formatRegistry } from '@puni/shared-checkout';
import { recordsModule } from '@puni/shared-records';
import {
  closeAfterEach,
  fixtureRemotes,
  type MemoryHostOptions,
  type MemoryTree,
  memoryHost,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { PlanAddRequest } from './contract';
import { navigatorPlanModule } from './module';

const track = closeAfterEach();

const state = '/w/demo';
const records = '/w/demo-records';
const filed = 'nav/plans/2031-04-05-first-plan.md';

const pair: MemoryTree = {
  [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes),
  [`${records}/AGENTS.md`]: '# records\n',
};

const request: PlanAddRequest = {
  kind: 'plan add',
  title: 'First plan',
  topics: 'ops,k3s',
  summary: 'The first plan.',
};

function open(
  tree: MemoryTree = pair,
  options: MemoryHostOptions = { heads: { [state]: 'abc1234' } },
) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule, navigatorPlanModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const run = (changes: Partial<PlanAddRequest> = {}, cwd = state) => {
    let stdout = '';
    let stderr = '';
    const code = container.resolve('navigatorPlanAddCommand').run(
      { ...request, ...changes },
      {
        cwd,
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    return { code, stdout, stderr };
  };
  return { host, run };
}

describe('navigator plan add', () => {
  test('files the plan against the state HEAD, prints its path and exits 0', () => {
    const { host, run } = open();
    expect(run()).toEqual({ code: 0, stdout: `${filed}\n`, stderr: '' });
    expect(host.nodes.get(`${records}/${filed}`)).toBe(
      '---\nkind: plan\ntitle: First plan\ndate: 2031-04-05\ncommit: abc1234\ntopics: ops, k3s\nsummary: The first plan.\n---\n\n# First plan\n',
    );
  });

  test('the body file is found from the directory the command started in', () => {
    const { host, run } = open({ ...pair, [`${state}/notes/body.md`]: 'Steps.\n' });
    expect(run({ bodyFile: 'body.md' }, `${state}/notes`).code).toBe(0);
    expect(host.nodes.get(`${records}/${filed}`)).toEndWith('---\n\nSteps.\n');
  });

  test.each([
    [{ title: '' }, 'error: title is empty; expected non-empty text on one line\n'],
    [
      { title: '?!' },
      'error: title "?!" gives an empty file name; it needs at least one letter or digit\n',
    ],
    [
      { topics: 'Ops' },
      'error: topics has invalid entries ["Ops"]; expected 1 to 5 comma-separated topics, each lower-case letters and digits joined by single hyphens, no duplicates\n',
    ],
    [{ bodyFile: 'missing.md' }, `error: the body file ${state}/missing.md does not exist\n`],
  ] as const)('%j is refused with one error line and exit 2', (changes, stderr) => {
    const { host, run } = open();
    expect(run(changes)).toEqual({ code: 2, stdout: '', stderr });
    expect(host.nodes.has(`${records}/${filed}`)).toBe(false);
  });

  test('an existing record is refused with exit 2 and kept', () => {
    const { host, run } = open({ ...pair, [`${records}/${filed}`]: 'kept' });
    expect(run()).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: ${filed} already exists in the records repository; a record is never overwritten, so give another title or wait a day\n`,
    });
    expect(host.nodes.get(`${records}/${filed}`)).toBe('kept');
  });

  test('a state repository with no commit is defective: one error line saying how to fix it, exit 1', () => {
    expect(open(pair, {}).run()).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: the HEAD commit of ${state} cannot be read: ${state} has no commit; fix: commit in ${state} so that HEAD names a commit, then rerun\n`,
    });
  });

  test('a body file that cannot be read is one error line and exit 1', () => {
    const { run } = open({ ...pair, [`${state}/body`]: { directory: true } });
    expect(run({ bodyFile: 'body' })).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: cannot read ${state}/body: EISDIR: ${state}/body\n`,
    });
  });

  test('a missing records checkout is one error line, exit 1', () => {
    const run = open({ [`${state}/puni.json`]: pair[`${state}/puni.json`] ?? '' }).run();
    expect([run.code, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toStartWith(
      `error: the system-records repository is not checked out at ${records}; `,
    );
  });
});
