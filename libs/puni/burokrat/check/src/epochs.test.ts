import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatRegistry } from '@puni/shared-checkout';
import { fixtureRemotes, removeFixture } from '@puni/shared-testing';
import { digestRulesSection, rulesDigestAt } from './agents-rules';
import {
  type CheckHost,
  dropRemedies,
  fixtureRuleSets,
  fixtureVersion,
  openCheckHost,
} from './check.test-host';
import { latestEpoch, type Rule } from './finding';
import { fixtureAgentsRules, makeRepository } from './repository-pair.test-host';
import { codeRules } from './rule-set.rule';
import { pinAgentsRules } from './rules/entry.rule';

/** A rule of the next epoch: `later.md` may not exist. */
const laterRule: Rule = {
  id: 'demo.later',
  since: 2,
  remedy: 'remove later.md',
  judge: ({ files }) => (files.exists('later.md') ? [{ path: 'later.md', message: 'exists' }] : []),
};

/** {@link fixtureRuleSets} with {@link laterRule} added to the system-state rules. */
const laterRuleSets: typeof fixtureRuleSets = {
  ...fixtureRuleSets,
  'system-state': [...fixtureRuleSets['system-state'], { level: 'project', rule: laterRule }],
};

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost(undefined, undefined, laterRuleSets);
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRepository();
  writeFileSync(join(root, 'later.md'), 'breaks the later rule\n');
});

afterEach(() => {
  removeFixture(root);
});

function pin(rules: number): void {
  writeFileSync(join(root, 'puni.json'), formatRegistry('system-state', fixtureRemotes, rules));
}

const pinned = codeRules.length;

describe('check at a rules pin', () => {
  test('a rule after the pin is not applied, and one newer line names it and the upgrade', () => {
    expect(host.runCheck({}, root)).toEqual({
      code: 0,
      stdout: `ok: system-state, ${String(pinned)} rules, no findings.\nnewer: puni.json pins rules epoch 1, so demo.later is not applied; run puni burokrat repo upgrade\n`,
      stderr: '',
    });
  });

  test('the newer line follows the fail summary too, and a project run names it as well', () => {
    writeFileSync(join(root, 'README.md'), `${'word '.repeat(151)}\n`);
    const whole = host.runCheck({}, root);
    expect(whole.code).toBe(1);
    expect(whole.stdout).toEndWith(
      `\nfail: system-state, ${String(pinned)} rules, 1 finding.\nnewer: puni.json pins rules epoch 1, so demo.later is not applied; run puni burokrat repo upgrade\n`,
    );
    expect(host.runCheck({ project: 'one' }, root).stdout).toContain('\nnewer: ');
  });

  test('a run that holds no later rule prints no newer line', () => {
    expect(host.runCheck({ staged: true }, root).stdout).toBe(
      'ok: system-state, staged files, 1 rule, no findings.\n',
    );
  });

  test('at the later pin the rule is applied and nothing is newer', () => {
    pin(2);
    expect(host.runCheck({}, root)).toEqual({
      code: 1,
      stdout: `demo.later later.md: exists; fix: remove later.md\nfail: system-state, ${String(pinned + 1)} rules, 1 finding.\n`,
      stderr: '',
    });
  });

  test('a pin past the latest epoch is refused naming both epochs and the version, exit 2', () => {
    pin(3);
    expect(host.runCheck({}, root)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: puni.json pins rules epoch 3, but puni ${fixtureVersion} knows rules only up to epoch 2; upgrade puni\n`,
    });
    expect(host.runCheck({ repo: 'system-records' }, root).code).toBe(2);
  });
});

describe('the latest rules', () => {
  test('their epoch is the latest since of the injected rule sets', () => {
    expect(host.container.resolve('latestRules').epoch).toBe(2);
    expect(latestEpoch(codeRules.map(({ rule }) => rule))).toBe(1);
  });

  test('judge the whole repository at the latest epoch, the pin notwithstanding', () => {
    const latest = host.container.resolve('latestRules');
    expect(latest.judge(root, fixtureAgentsRules)).toEqual([
      { rule: 'demo.later', path: 'later.md', message: 'exists', remedy: 'remove later.md' },
    ]);
  });

  test('judge AGENTS.md as if its rules section were the given text', () => {
    const latest = host.container.resolve('latestRules');
    const other = '## Rules\n\n1. Something else.\n';
    expect(dropRemedies(latest.judge(root, other))).toEqual([
      {
        rule: 'agents.rules',
        path: 'AGENTS.md',
        message: `rules section digests to ${digestRulesSection(other)}, not ${digestRulesSection(fixtureAgentsRules)}, the rules in force at epoch 2`,
      },
      { rule: 'demo.later', path: 'later.md', message: 'exists' },
    ]);
  });

  test('a defect of the inputs is one finding', () => {
    writeFileSync(join(root, 'puni.json'), '{');
    expect(
      host.container
        .resolve('latestRules')
        .judge(root, fixtureAgentsRules)
        .map(({ rule }) => rule),
    ).toEqual(['repository.config']);
  });
});

describe('agents.rules by epoch', () => {
  const second = '## Rules\n\n1. The second rules.\n';
  const digests = { 1: digestRulesSection(fixtureAgentsRules), 3: digestRulesSection(second) };
  const rule = pinAgentsRules(digests);

  test('is as old as its first digest, and each later one is a revision', () => {
    expect([rule.since, rule.revisions]).toEqual([1, [3]]);
    expect(latestEpoch([rule])).toBe(3);
  });

  test('the digest in force is that of the largest epoch at or below the pin', () => {
    expect([0, 1, 2, 3, 9].map((epoch) => rulesDigestAt(digests, epoch))).toEqual([
      undefined,
      digests[1],
      digests[1],
      digests[3],
      digests[3],
    ]);
  });

  test.each([
    [1, fixtureAgentsRules, []],
    [2, fixtureAgentsRules, []],
    [3, second, []],
    [3, fixtureAgentsRules, ['agents.rules']],
    [1, second, ['agents.rules']],
  ] as const)('at pin %p the given section holds unless listed: %#', (epoch, section, rules) => {
    pin(epoch);
    writeFileSync(join(root, 'AGENTS.md'), `# demo\n\n${section}`);
    expect(host.judge(rule, root).map((finding) => finding.rule)).toEqual([...rules]);
  });
});
