import { parse } from '@optique/core';
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
import type { RunLogRequest } from './contract';
import { runParser } from './group';
import { dashRunModule } from './module';

const track = closeAfterEach();

const state = '/w/demo';
const records = '/w/demo-records';
const filed = 'bur/assessments/2031-04-05-nightly-build.md';

const pair: MemoryTree = {
  [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 1),
  [`${records}/AGENTS.md`]: '# records\n',
};

const request: RunLogRequest = {
  kind: 'run log',
  title: 'Nightly build',
  topics: 'build,ci',
  summary: 'The build passed in four minutes.',
};

function open(
  tree: MemoryTree = pair,
  options: MemoryHostOptions = { heads: { [state]: 'abc1234' } },
) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule, dashRunModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const run = (changes: Partial<RunLogRequest> = {}) => {
    let stdout = '';
    let stderr = '';
    const code = container.resolve('dashRunLogCommand').run(
      { ...request, ...changes },
      {
        cwd: state,
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

describe('runParser', () => {
  test('a bare run asks for its help', () => {
    expect(parse(runParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['run'] },
    });
  });

  test.each(['stray', '--bogus', 'log --title T'])('%s is refused', (line) => {
    expect(parse(runParser, line.split(' ')).success).toBe(false);
  });
});

describe('dash run log', () => {
  test('files an assessment with Command, Outcome and Evidence sections, prints its path, exits 0', () => {
    const { host, run } = open();
    expect(run()).toEqual({ code: 0, stdout: `${filed}\n`, stderr: '' });
    expect(host.nodes.get(`${records}/${filed}`)).toBe(
      '---\npuni-doc-type: record\nkind: assessment\ntitle: Nightly build\ndate: 2031-04-05\ncommit: abc1234\ntopics: build, ci\nsummary: The build passed in four minutes.\n---\n\n# Nightly build\n\n## Command\n\n## Outcome\n\n## Evidence\n',
    );
  });

  test('a bad topic is refused with one error line and exit 2', () => {
    const { host, run } = open();
    const refused = run({ topics: 'Build' });
    expect([refused.code, refused.stdout]).toEqual([2, '']);
    expect(refused.stderr).toStartWith('error: topics has invalid entries ["Build"]; ');
    expect(host.nodes.has(`${records}/${filed}`)).toBe(false);
  });

  test('a state repository with no commit is defective: one error line, exit 1', () => {
    const defective = open(pair, {}).run();
    expect([defective.code, defective.stdout]).toEqual([1, '']);
    expect(defective.stderr).toStartWith(`error: the HEAD commit of ${state} cannot be read: `);
  });
});
