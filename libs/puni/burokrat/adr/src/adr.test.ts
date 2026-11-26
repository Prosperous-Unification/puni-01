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
import type { AdrAddRequest } from './contract';
import { burokratAdrModule } from './module';

const track = closeAfterEach();

const state = '/w/demo';
const records = '/w/demo-records';
const filed = 'bur/adr/2031-04-05-first-note.md';

const pair: MemoryTree = {
  [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 1),
  [`${records}/AGENTS.md`]: '# records\n',
};

const request: AdrAddRequest = {
  kind: 'adr add',
  title: 'First note',
  topics: 'ops,k3s',
  summary: 'The first one.',
};

function open(
  tree: MemoryTree = pair,
  options: MemoryHostOptions = { heads: { [state]: 'abc1234' } },
) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule, burokratAdrModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const run = (changes: Partial<AdrAddRequest> = {}, cwd = state) => {
    let stdout = '';
    let stderr = '';
    const code = container.resolve('burokratAdrAddCommand').run(
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

describe('burokrat adr add', () => {
  test('files a adr record against the state HEAD, prints its path and exits 0', () => {
    const { host, run } = open();
    expect(run()).toEqual({ code: 0, stdout: `${filed}\n`, stderr: '' });
    expect(host.nodes.get(`${records}/${filed}`)).toBe(
      '---\npuni-doc-type: record\nkind: adr\ntitle: First note\ndate: 2031-04-05\ncommit: abc1234\ntopics: ops, k3s\nsummary: The first one.\n---\n\n# First note\n\n## Decision\n\n## Why\n\n## Options rejected\n',
    );
  });

  test('the body file, found from the directory the command started in, replaces the default', () => {
    const { host, run } = open({ ...pair, [`${state}/notes/body.md`]: 'Found.\n' });
    expect(run({ bodyFile: 'body.md' }, `${state}/notes`).code).toBe(0);
    expect(host.nodes.get(`${records}/${filed}`)).toEndWith('---\n\nFound.\n');
  });

  test('bad topics are refused with one error line and exit 2, filing nothing', () => {
    const { host, run } = open();
    expect(run({ topics: 'Ops' })).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: topics has invalid entries ["Ops"]; expected 1 to 5 comma-separated topics, each lower-case letters and digits joined by single hyphens, no duplicates\n',
    });
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

  test('a state repository with no commit is defective: one error line, exit 1', () => {
    expect(open(pair, {}).run()).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: the HEAD commit of ${state} cannot be read: ${state} has no commit; fix: commit in ${state} so that HEAD names a commit, then rerun\n`,
    });
  });
});
