import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryScope } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { digestRulesSection, rulesDigestAt } from './agents-rules';
import {
  type CheckHost,
  dropRemedies,
  fixtureCheckRules,
  fixtureVersion,
  openCheckHost,
} from './check.test-host';
import type { CheckRequest } from './contract';
import {
  appliesAt,
  type CheckRules,
  latestEpoch,
  type LeveledRule,
  listEveryRule,
  type Rule,
} from './finding';
import {
  fixtureAgentsRules,
  formatFixtureRegistry,
  makeRepositoryPair,
} from './repository-pair.test-host';
import { checkRules, latestRulesEpoch, retiredRules } from './rule-set.rule';
import { pinAgentsRules } from './rules/entry.rule';

/** A rule that finds `path` wherever it exists, under `id`, from `since` (until `until`). */
function finds(id: string, path: string, since: number, until?: number): Rule {
  return {
    id,
    since,
    ...(until === undefined ? {} : { until }),
    remedy: `remove ${path}`,
    judge: ({ files }) => (files.exists(path) ? [{ path, message: 'exists' }] : []),
  };
}

/** A rule that finds `path` when the checkout shows it, as a staged or commit view does. */
function shows(id: string, path: string, since: number): Rule {
  return {
    id,
    since,
    remedy: `remove ${path}`,
    judge: ({ files }) =>
      files.listVisible(repositoryScope).includes(path) ? [{ path, message: 'exists' }] : [],
  };
}

/** The rules section the fixture's `AGENTS.md` must hold from epoch 2. */
const secondRules = '## Rules\n\n1. **The second rules.** Stricter than the first.\n';

/** `rule` as epoch 1 holds it, applying from there on. */
function freeze(rule: Rule): Rule {
  const frozen: { -readonly [Key in keyof Rule]: Rule[Key] } = { ...rule };
  delete frozen.until;
  return frozen;
}

/** The rules of `rules` that apply at epoch 1, each frozen there (see {@link freeze}). */
function freezeAll(rules: readonly Rule[]): Rule[] {
  return rules.filter((rule) => appliesAt(rule, 1)).map(freeze);
}

const fixture = fixtureCheckRules({
  1: digestRulesSection(fixtureAgentsRules),
  2: digestRulesSection(secondRules),
});

/**
 * The fixture rules frozen at epoch 1, but for their `agents.rules` rules, which hold the
 * fixture's own rules texts: so the epochs the tests walk are only those this file adds, however
 * many the production rules reach.
 */
const base: CheckRules = {
  ...fixture,
  sets: {
    'system-state': fixture.sets['system-state'].flatMap(({ level, rule }) => {
      if (rule.id === 'agents.rules') return [{ level, rule }];
      return freezeAll([rule]).map((frozen) => ({ level, rule: frozen }));
    }),
    'system-records': fixture.sets['system-records'].flatMap(({ level, rule }) =>
      freezeAll([rule]).map((frozen) => ({ level, rule: frozen })),
    ),
  },
  crossProject: freezeAll(fixture.crossProject),
  secrets: {
    'system-state': freezeAll(fixture.secrets['system-state']),
    'system-records': freezeAll(fixture.secrets['system-records']),
  },
};
const project = (rule: Rule): LeveledRule => ({ level: 'project', rule });

/**
 * The fixture rules with a later rule in every list, an epoch-2 rules text, and one rule that
 * stops applying at epoch 2.
 */
const laterRules: CheckRules = {
  ...base,
  sets: {
    'system-state': [
      ...base.sets['system-state'],
      project(finds('demo.later', 'later.md', 2)),
      project(finds('demo.also', 'later.md', 2)),
      { level: 'repository', rule: finds('demo.retired', 'retired.md', 1, 2) },
    ],
    'system-records': [
      ...base.sets['system-records'].map(({ level, rule }) => ({ level, rule })),
      { level: 'repository', rule: finds('demo.records', 'AGENTS.md', 2) },
    ],
  },
  crossProject: [...base.crossProject, finds('demo.cross', 'later.md', 2)],
  secrets: {
    'system-state': [...base.secrets['system-state'], shows('demo.staged', 'later.md', 2)],
    'system-records': [...base.secrets['system-records'], shows('demo.secret', 'AGENTS.md', 2)],
  },
};

const scratchDirectories = removeScratchDirectoriesAfterEach();
let state = '';
let records = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost(undefined, undefined, laterRules);
});

afterAll(async () => {
  await host.close();
});

beforeEach(() => {
  ({ state, records } = makeRepositoryPair(scratchDirectories));
  writeFileSync(join(state, 'later.md'), 'breaks the later rules\n');
  git(state, 'add', 'later.md');
  git(records, 'add', 'AGENTS.md');
});

/** Runs git in `root` as a fixed author, returning what it printed, trimmed. */
function git(root: string, ...args: string[]): string {
  const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
  return child.stdout.toString().trim();
}

/** Pins the fixture at `rules`; from epoch 2 its `AGENTS.md` holds {@link secondRules}. */
function pin(rules: number): void {
  writeFileSync(join(state, 'puni.json'), formatFixtureRegistry(rules));
  if (rules < 2) return;
  const agents = join(state, 'AGENTS.md');
  writeFileSync(agents, readFileSync(agents, 'utf8').replace(fixtureAgentsRules, secondRules));
}

const newer = (ids: string) =>
  `newer: puni.json pins rules epoch 1, so ${ids} not applied; run puni burokrat repo upgrade\n`;
const later = (id: string) => `${id} later.md: exists; fix: remove later.md`;

const modes: readonly (readonly [string, CheckRequest, string, string])[] = [
  [
    'whole',
    {},
    `ok: system-state, 25 rules, no findings.\n${newer('agents.rules, demo.also, demo.later are')}`,
    `${later('demo.also')}\n${later('demo.later')}\nfail: system-state, 26 rules, 2 findings.\n`,
  ],
  [
    '--project one',
    { project: 'one' },
    `ok: system-state, project one, 11 rules, no findings.\n${newer('demo.also, demo.later are')}`,
    `${later('demo.also')}\n${later('demo.later')}\nfail: system-state, project one, 13 rules, 2 findings.\n`,
  ],
  [
    '--cross-project-links',
    { crossProjectLinks: true },
    `ok: system-state, cross-project links, 3 rules, no findings.\n${newer('demo.cross is')}`,
    `${later('demo.cross')}\nfail: system-state, cross-project links, 4 rules, 1 finding.\n`,
  ],
  [
    '--staged',
    { staged: true },
    `ok: system-state, staged files, 2 rules, no findings.\n${newer('demo.staged is')}`,
    `${later('demo.staged')}\nfail: system-state, staged files, 3 rules, 1 finding.\n`,
  ],
  [
    '--repo system-records --staged',
    { repo: 'system-records', staged: true },
    `ok: system-records, staged files, 2 rules, no findings.\n${newer('demo.secret is')}`,
    'demo.secret AGENTS.md: exists; fix: remove AGENTS.md\nfail: system-records, staged files, 3 rules, 1 finding.\n',
  ],
  [
    '--repo system-records',
    { repo: 'system-records' },
    `ok: system-records, 10 rules, no findings.\n${newer('demo.records is')}`,
    'demo.records AGENTS.md: exists; fix: remove AGENTS.md\nfail: system-records, 11 rules, 1 finding.\n',
  ],
];

describe('check at a rules pin', () => {
  test.each(modes)('%s at pin 1 applies no later rule and names them', (_mode, request, out) => {
    expect(host.runCheck(request, state)).toEqual({ code: 0, stdout: out, stderr: '' });
  });

  test.each(modes)('%s at pin 2 applies them, with nothing newer', (_mode, request, _ok, out) => {
    pin(2);
    expect(host.runCheck(request, state)).toEqual({ code: 1, stdout: out, stderr: '' });
  });

  test('--commits at pin 1 applies no later secret rule and names it; at pin 2 it applies', () => {
    git(state, 'reset', '-q', 'later.md');
    git(state, 'add', '-A');
    git(state, 'reset', '-q', 'later.md');
    git(state, 'commit', '-q', '-m', 'base');
    git(state, 'add', 'later.md');
    git(state, 'commit', '-q', '-m', 'later');
    const hash = git(state, 'rev-parse', '--short', 'HEAD');
    expect(host.runCheck({ commits: 'HEAD~1..HEAD' }, state)).toEqual({
      code: 0,
      stdout: `ok: system-state, commits HEAD~1..HEAD, 1 commit, 2 rules, no findings.\n${newer('demo.staged is')}`,
      stderr: '',
    });
    pin(2);
    expect(host.runCheck({ commits: 'HEAD~1..HEAD' }, state)).toEqual({
      code: 1,
      stdout: `demo.staged ${hash}:later.md: exists; fix: remove later.md; ${hash} is pushed, so it is public: rotate any credential it exposed, and before merge rewrite the branch so that no commit holds it (\`git rebase -i HEAD~1\`, edit ${hash}, \`git push --force-with-lease\`)\nfail: system-state, commits HEAD~1..HEAD, 1 commit, 3 rules, 1 finding.\n`,
      stderr: '',
    });
  });

  test('a retired rule applies before its until and is neither applied nor newer after', () => {
    writeFileSync(join(state, 'retired.md'), 'x\n');
    expect(host.runCheck({}, state).stdout).toStartWith(
      'demo.retired retired.md: exists; fix: remove retired.md\nfail: system-state, 25 rules, 1 finding.\n',
    );
    pin(2);
    expect(host.runCheck({}, state).stdout).not.toContain('demo.retired');
  });

  test('at pin 2 the epoch-1 rules text is an agents.rules finding naming the upgrade', () => {
    pin(2);
    const agents = join(state, 'AGENTS.md');
    writeFileSync(agents, readFileSync(agents, 'utf8').replace(secondRules, fixtureAgentsRules));
    expect(host.runCheck({}, state).stdout).toContain(
      `agents.rules AGENTS.md: rules section digests to ${digestRulesSection(fixtureAgentsRules)}, not ${digestRulesSection(secondRules)}, the rules in force at epoch 2; fix: restore`,
    );
  });

  test.each([{}, { repo: 'system-records' } as const])(
    'a pin past the latest epoch is refused naming both epochs and the version, exit 2: %j',
    (request) => {
      pin(3);
      expect(host.runCheck(request, state)).toEqual({
        code: 2,
        stdout: '',
        stderr: `error: puni.json pins rules epoch 3, but puni ${fixtureVersion} knows rules only up to epoch 2; upgrade puni\n`,
      });
    },
  );
});

describe('the latest rules', () => {
  test('their epoch is the latest since or until of every injected list', () => {
    expect(host.container.resolve('latestRules').epoch).toBe(2);
    expect(latestEpoch([finds('a.b', 'x', 1, 4)])).toBe(4);
  });

  test('judge every repository at the latest epoch as if the rules section were the given text', () => {
    const judged = host.container.resolve('latestRules').judge(state, secondRules);
    expect(dropRemedies(judged['system-state'])).toEqual([
      { rule: 'demo.also', path: 'later.md', message: 'exists' },
      { rule: 'demo.later', path: 'later.md', message: 'exists' },
    ]);
    expect(dropRemedies(judged['system-records'])).toEqual([
      { rule: 'demo.records', path: 'AGENTS.md', message: 'exists' },
    ]);
    expect(
      host.container
        .resolve('latestRules')
        .judge(state, fixtureAgentsRules)
        ['system-state'].map(({ rule }) => rule),
    ).toEqual(['agents.rules', 'demo.also', 'demo.later']);
  });

  test('a records checkout that is not beside the state one is its one finding', () => {
    rmSync(records, { recursive: true });
    const judged = host.container.resolve('latestRules').judge(state, secondRules);
    expect(judged['system-records'].map(({ rule, path }) => `${rule} ${path}`)).toEqual([
      'repository.checkout .',
    ]);
    expect(judged['system-state']).toHaveLength(2);
  });

  test('a section holds the rules of an epoch when its digest is the one in force there', () => {
    const latest = host.container.resolve('latestRules');
    expect([
      latest.holdsRulesOf(secondRules, 2),
      latest.holdsRulesOf(fixtureAgentsRules, 2),
      latest.holdsRulesOf(fixtureAgentsRules, 1),
    ]).toEqual([true, false, true]);
  });
});

describe('agents.rules by epoch', () => {
  const digests = { 1: digestRulesSection(fixtureAgentsRules), 3: digestRulesSection(secondRules) };
  const [first, third] = pinAgentsRules(digests);

  test('is one rule per digest, each applying until the next', () => {
    expect([first?.since, first?.until, third?.since, third?.until]).toEqual([1, 3, 3, undefined]);
    expect(first?.remedy).toEndWith(
      ', then run puni burokrat repo upgrade to take the rules of epoch 3',
    );
    expect(latestEpoch(pinAgentsRules(digests))).toBe(3);
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
});

describe('the production rules', () => {
  test('each id applied at a pin is applied at the next, unless retiredRules retires it there', () => {
    const lists: readonly (readonly Rule[])[] = [
      ...Object.values(checkRules.sets).map((set) => set.map(({ rule }) => rule)),
      checkRules.crossProject,
      ...Object.values(checkRules.secrets),
    ];
    for (const rules of lists) {
      for (let at = 1; at < latestRulesEpoch; at += 1) {
        const ids = (epoch: number) =>
          new Set(rules.filter((rule) => appliesAt(rule, epoch)).map(({ id }) => id));
        const next = ids(at + 1);
        const lost = [...ids(at)].filter((id) => !next.has(id) && retiredRules[id] !== at + 1);
        expect([at, lost]).toEqual([at, []]);
      }
    }
  });

  test('every retirement is a rule whose until is its epoch', () => {
    for (const [id, epoch] of Object.entries(retiredRules)) {
      expect(listEveryRule(checkRules).some((rule) => rule.id === id && rule.until === epoch)).toBe(
        true,
      );
    }
  });

  test('the latest epoch is that of every rule', () => {
    expect(latestRulesEpoch).toBe(latestEpoch(listEveryRule(checkRules)));
  });
});
