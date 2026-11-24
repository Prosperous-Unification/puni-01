import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CheckoutUnlistable, formatRegistry } from '@puni/shared-checkout';
import {
  optionalRecordKeys,
  recordDirectories,
  recordKinds,
  recordsTopLevel,
  recordSummaryWordBudget,
  recordTopicLimit,
  requiredRecordKeys,
} from '@puni/shared-records';
import {
  fixtureRemotes,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { type CheckHost, dropRemedies, type Judged, openCheckHost } from './check.test-host';
import type { CheckRequest } from './contract';
import type { Rule } from './finding';
import { recordsRules } from './rule-set.rule';
import { agentsExists, agentsWords, claudeLinksAgents } from './rules/entry.rule';
import { resolveAgentsLinks } from './rules/links.rule';
import {
  judgeRecordFrontMatter,
  judgeRecordNames,
  judgeRecordsLayout,
  judgeSupersession,
} from './rules/records.rule';
import {
  describeRecord,
  makeRecordsRepository,
  supersededRecord,
  supersedingRecord,
  writeRecord,
} from './repository-pair.test-host';
import { forbidPlaintextSecrets, forbidRecordsAddresses } from './rules/secrets.rule';
import { credentialSamples, forbiddenAddress } from './secrets.test-host';

const scratch = removeScratchDirectoriesAfterEach();

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost(undefined, []);
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRecordsRepository(scratch);
});

/** The system-state repository beside the records repository under test. */
function stateRoot(): string {
  return join(dirname(root), 'demo');
}

function judge(rule: Rule): Judged[] {
  return dropRemedies(host.judge(rule, root, stateRoot()));
}

const record = 'bur/adr/2031-04-07-a-decision.md';

function writeAdr(extra: Readonly<Record<string, string>> = {}, drop?: string): void {
  const fields = describeRecord(record, extra);
  if (drop !== undefined) Reflect.deleteProperty(fields, drop);
  writeRecord(root, record, fields);
}

function frontMatterFinding(message: string): Judged[] {
  return [{ rule: 'records.front-matter', path: record, message }];
}

describe('the fixture records repository passes every records rule', () => {
  test.each(recordsRules.map(({ rule }) => [rule.id, rule] as const))('%s', (_name, rule) => {
    expect(judge(rule)).toEqual([]);
  });

  test('a record in every kind directory passes', () => {
    for (const kind of recordKinds) {
      const path = `${recordDirectories[kind]}/2031-04-07-one-${kind}.md`;
      writeRecord(root, path, describeRecord(path));
    }
    expect(recordsRules.flatMap(({ rule }) => judge(rule))).toEqual([]);
  });

  test('an untracked, un-ignored record with bad front matter is still a finding', () => {
    writeRepositoryFile(root, 'nav/research/2031-04-07-notes.md', 'no front matter\n');
    expect(judge(judgeRecordFrontMatter).map((finding) => finding.path)).toEqual([
      'nav/research/2031-04-07-notes.md',
    ]);
  });
});

describe('files git ignores', () => {
  test('an ignored .idea/workspace.xml produces no finding', () => {
    writeRepositoryFile(root, '.gitignore', '.idea/\n');
    writeRepositoryFile(root, '.idea/workspace.xml', '<project/>');
    expect(recordsRules.flatMap(({ rule }) => judge(rule))).toEqual([]);
  });

  test('the same file without the ignore rule is a records.layout finding', () => {
    writeRepositoryFile(root, '.idea/workspace.xml', '<project/>');
    expect(judge(judgeRecordsLayout).map((finding) => finding.path)).toEqual(['.idea']);
  });

  test('an ignored record is invisible to every records rule', () => {
    writeRepositoryFile(root, '.gitignore', 'nav/plans/*-scratch.md\n');
    writeRepositoryFile(root, 'nav/plans/2031-04-08-scratch.md', 'no front matter\n');
    expect(recordsRules.flatMap(({ rule }) => judge(rule))).toEqual([]);
  });

  test('a tracked record deleted from the working tree is skipped', () => {
    runGit(root, ['add', '-A']);
    rmSync(join(root, supersedingRecord));
    expect(judge(judgeRecordsLayout)).toEqual([]);
    expect(judge(judgeRecordFrontMatter)).toEqual([]);
    expect(judge(judgeRecordNames)).toEqual([]);
  });

  test.each([
    ['records.layout', judgeRecordsLayout],
    ['records.name', judgeRecordNames],
    ['records.front-matter', judgeRecordFrontMatter],
    ['records.supersession', judgeSupersession],
  ] as const)(
    'git failing makes %s throw the repository.git defect, not pass',
    (_rule, judgeRule) => {
      rmSync(join(root, '.git'), { recursive: true });
      mkdirSync(join(root, '.git'));
      throws(() => host.judge(judgeRule, root, stateRoot()), CheckoutUnlistable);
    },
  );
});

describe('records.layout', () => {
  test('every allowed top-level name passes', () => {
    for (const [name, type] of Object.entries(recordsTopLevel)) {
      if (type === 'directory') mkdirSync(join(root, name), { recursive: true });
      else if (name !== 'CLAUDE.md')
        writeRepositoryFile(root, name, formatRegistry('system-records', fixtureRemotes));
    }
    expect(judge(judgeRecordsLayout)).toEqual([]);
  });

  test.each([
    [
      '.idea/workspace.xml',
      '.idea',
      'is not part of the records layout; the top level holds only ',
    ],
    ['notes.md', 'notes.md', 'is not part of the records layout; the top level holds only '],
    [
      'nav/drafts/x.md',
      'nav/drafts',
      'is not a kind directory; nav/ holds only the directories plans, research',
    ],
    [
      'bur/plans/x.md',
      'bur/plans',
      'is not a kind directory; bur/ holds only the directories adr, assessments, archive',
    ],
    [
      'bur/adr/old/x.md',
      'bur/adr/old',
      'is not a regular file; a kind directory holds only record files',
    ],
  ])('%s is a finding at %s', (file, path, message) => {
    writeRepositoryFile(root, file, 'x');
    const findings = judge(judgeRecordsLayout);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe(path);
    expect(findings[0]?.message).toStartWith(message);
  });

  test('a top-level name of the wrong type is a finding', () => {
    rmSync(join(root, 'dash'), { recursive: true });
    writeRepositoryFile(root, 'dash', 'a file, not a directory');
    expect(judge(judgeRecordsLayout)).toEqual([
      { rule: 'records.layout', path: 'dash', message: 'must be a directory' },
    ]);
  });

  test('a symlink in a kind directory is a finding', () => {
    symlinkSync('2031-04-05-first-plan.md', join(root, 'nav/plans/2031-04-09-link.md'));
    expect(judge(judgeRecordsLayout)).toEqual([
      {
        rule: 'records.layout',
        path: 'nav/plans/2031-04-09-link.md',
        message: 'is not a regular file; a kind directory holds only record files',
      },
    ]);
  });
});

describe('records.name', () => {
  test.each([
    'notes.md',
    '2031-02-30-not-a-day.md',
    '2031-04-07-Upper.md',
    '2031-04-07-double--hyphen.md',
    '2031-04-07-slug.txt',
    '2031-4-7-short.md',
  ])('%s is refused', (name) => {
    const path = `bur/archive/${name}`;
    writeRecord(root, path, describeRecord(path, { date: '2031-04-07' }));
    expect(judge(judgeRecordNames)).toEqual([
      {
        rule: 'records.name',
        path,
        message:
          'must be named YYYY-MM-DD-<slug>.md: a real calendar date, then lower-case letters and digits joined by single hyphens',
      },
    ]);
  });
});

describe('records.front-matter', () => {
  test('a record without front matter gets one finding stating the whole schema', () => {
    writeRepositoryFile(root, record, '# A decision\n');
    const findings = judge(judgeRecordFrontMatter);
    expect(findings).toHaveLength(1);
    const message = findings[0]?.message ?? '';
    expect(message).toStartWith('does not open with front matter');
    for (const [key, form] of Object.entries({ ...requiredRecordKeys, ...optionalRecordKeys })) {
      expect(message).toContain(`${key}: ${form}`);
    }
  });

  test('a malformed front matter line is a finding', () => {
    writeRepositoryFile(root, record, '---\nkind adr\n---\n');
    expect(judge(judgeRecordFrontMatter)).toEqual(
      frontMatterFinding('has a malformed front matter line "kind adr"; each line is "key: value"'),
    );
  });

  test.each(Object.keys(requiredRecordKeys))('a record without %s is a finding', (key) => {
    writeAdr({}, key);
    expect(judge(judgeRecordFrontMatter)).toEqual(
      frontMatterFinding(
        `has no ${key}; expected ${requiredRecordKeys[key as keyof typeof requiredRecordKeys]}`,
      ),
    );
  });

  const topics = Array.from(
    { length: recordTopicLimit + 1 },
    (_unused, index) => `t${String(index)}`,
  );
  test.each([
    ['kind', 'plan', 'is plan'],
    ['kind', 'decision', 'is decision'],
    ['title', '', 'is empty'],
    ['date', '2031-04-08', 'is 2031-04-08'],
    ['commit', 'ABC1234', 'is ABC1234'],
    ['commit', 'abc12', 'is abc12'],
    ['topics', topics.join(', '), `has ${String(recordTopicLimit + 1)} entries`],
    ['topics', 'good, Bad_topic', 'has invalid entries ["Bad_topic"]'],
    ['topics', '', 'has invalid entries [""]'],
    ['topics', 'same, same', 'repeats same'],
    ['summary', '', 'is empty'],
    [
      'summary',
      'w '.repeat(recordSummaryWordBudget + 1).trim(),
      `has ${String(recordSummaryWordBudget + 1)} words`,
    ],
    ['supersedes', '../elsewhere.md', 'is "../elsewhere.md"'],
    ['superseded-by', '/abs/path.md', 'is "/abs/path.md"'],
  ] as const)('%s: %j is a finding', (key, value, problem) => {
    writeAdr({ [key]: value });
    const forms: Readonly<Record<string, string>> = {
      ...requiredRecordKeys,
      ...optionalRecordKeys,
    };
    expect(judge(judgeRecordFrontMatter)).toEqual(
      frontMatterFinding(`${key} ${problem}; expected ${forms[key] ?? ''}`),
    );
  });

  test('an unknown key is a finding naming the allowed keys', () => {
    writeAdr({ status: 'done' });
    const allowed = Object.keys({ ...requiredRecordKeys, ...optionalRecordKeys }).join(', ');
    expect(judge(judgeRecordFrontMatter)).toEqual(
      frontMatterFinding(`has the unknown key status; the keys are ${allowed}`),
    );
  });

  test('a repeated key is a finding', () => {
    writeRepositoryFile(
      root,
      record,
      [
        '---',
        ...Object.entries(describeRecord(record)).map(([k, v]) => `${k}: ${v}`),
        'title: again',
        '---',
        '',
      ].join('\n'),
    );
    expect(judge(judgeRecordFrontMatter)).toEqual(
      frontMatterFinding('repeats the key title; each key appears once'),
    );
  });
});

describe('records.supersession', () => {
  test.each([
    [{ supersedes: record }, `supersedes names the record itself`],
    [
      { supersedes: 'bur/adr/2031-01-01-missing.md' },
      'supersedes bur/adr/2031-01-01-missing.md is not a record in a kind directory',
    ],
    [
      { 'superseded-by': 'dash/notes.md' },
      'superseded-by dash/notes.md is not a record in a kind directory',
    ],
    [
      { supersedes: supersededRecord },
      `supersedes ${supersededRecord}, which does not say superseded-by: ${record}`,
    ],
  ])('%j is a finding', (extra, message) => {
    writeRepositoryFile(root, 'dash/notes.md', 'x');
    writeAdr(extra);
    expect(judge(judgeSupersession)).toEqual([
      { rule: 'records.supersession', path: record, message },
    ]);
  });

  test('a superseded-by the other record does not answer is a finding', () => {
    writeRecord(root, supersedingRecord, describeRecord(supersedingRecord));
    expect(judge(judgeSupersession)).toEqual([
      {
        rule: 'records.supersession',
        path: supersededRecord,
        message: `superseded-by ${supersedingRecord}, which does not say supersedes: ${supersededRecord}`,
      },
    ]);
  });
});

describe('supersession cycles', () => {
  const third = 'nav/plans/2031-04-07-third-plan.md';

  test('two records that each supersede the other are a cycle naming both', () => {
    writeRecord(
      root,
      supersededRecord,
      describeRecord(supersededRecord, {
        supersedes: supersedingRecord,
        'superseded-by': supersedingRecord,
      }),
    );
    writeRecord(
      root,
      supersedingRecord,
      describeRecord(supersedingRecord, {
        supersedes: supersededRecord,
        'superseded-by': supersededRecord,
      }),
    );
    expect(host.judge(judgeSupersession, root, stateRoot())).toEqual([
      {
        rule: 'records.supersession',
        path: supersededRecord,
        message: `is in a supersession cycle: ${supersededRecord} → ${supersedingRecord}`,
        remedy: 'break the cycle: a record supersedes only records older than itself',
      },
    ]);
  });

  test('three records superseding round in a ring are one cycle naming all three', () => {
    const ring = [supersededRecord, supersedingRecord, third];
    for (const [index, path] of ring.entries()) {
      const newer = ring[(index + ring.length - 1) % ring.length] ?? '';
      const older = ring[(index + 1) % ring.length] ?? '';
      writeRecord(root, path, describeRecord(path, { supersedes: older, 'superseded-by': newer }));
    }
    expect(judge(judgeSupersession)).toEqual([
      {
        rule: 'records.supersession',
        path: supersededRecord,
        message: `is in a supersession cycle: ${ring.join(' → ')}`,
      },
    ]);
  });

  test('a chain of three is no cycle', () => {
    writeRecord(
      root,
      supersedingRecord,
      describeRecord(supersedingRecord, { supersedes: supersededRecord, 'superseded-by': third }),
    );
    writeRecord(root, third, describeRecord(third, { supersedes: supersedingRecord }));
    expect(judge(judgeSupersession)).toEqual([]);
  });
});

describe('the check command on a records repository', () => {
  function runIn(
    cwd: string,
    request: CheckRequest = { repo: 'system-records' },
  ): { code: number; printed: string } {
    const run = host.runCheck(request, cwd);
    if (run.stderr !== '') throw new Error(`unexpected stderr: ${run.stderr}`);
    return { code: run.code, printed: run.stdout };
  }

  test('--repo system-records from the system-state repository applies the records rule set', () => {
    expect(runIn(join(stateRoot(), 'apps'))).toEqual({
      code: 0,
      printed: `ok: system-records, ${String(recordsRules.length)} rules, no findings.\n`,
    });
  });

  test('a records repository holding its own puni.json is judged as system-records with no option', () => {
    writeRepositoryFile(root, 'puni.json', formatRegistry('system-records', fixtureRemotes));
    expect(runIn(join(root, 'nav/plans'), {})).toEqual({
      code: 0,
      printed: `ok: system-records, ${String(recordsRules.length)} rules, no findings.\n`,
    });
  });

  test('standing in the records checkout without puni.json is repository.root with the hint', () => {
    expect(runIn(root, {})).toEqual({
      code: 1,
      printed: `repository.root .: no puni.json in ${root} or any directory above it; run puni from the system-state repository, which holds puni.json; fix: run puni from the system-state repository or a directory in it\nfail: no repository, 1 finding.\n`,
    });
  });

  test.each([
    [
      'missing',
      () => {
        rmSync(root, { recursive: true });
      },
    ],
    [
      'a file in its place',
      () => {
        rmSync(root, { recursive: true });
        writeRepositoryFile(dirname(root), 'demo-records', 'not a checkout');
      },
    ],
  ])('a records checkout %s is one repository.checkout finding, exit 1', (_name, breach) => {
    breach();
    expect(runIn(stateRoot())).toEqual({
      code: 1,
      printed: `repository.checkout .: the system-records repository is not checked out at ${root}; clone https://github.com/acme/demo-records there; fix: clone it: git clone https://github.com/acme/demo-records ${root}\nfail: system-records, 1 finding.\n`,
    });
  });

  test('code-only rules do not apply: no README, index or package.json is needed', () => {
    writeRepositoryFile(root, 'dash/2031-04-05.md', 'dated and free form');
    expect(runIn(stateRoot()).code).toBe(0);
  });

  test('a broken AGENTS.md link is a finding', () => {
    writeRepositoryFile(root, 'AGENTS.md', 'See [gone](bur/gone.md).\n');
    expect(runIn(stateRoot())).toEqual({
      code: 1,
      printed: `links.resolve AGENTS.md: links to missing bur/gone.md; fix: point the link at a path that exists, or remove it\nfail: system-records, ${String(recordsRules.length)} rules, 1 finding.\n`,
    });
  });
});

/** One breach for every records rule, each making its rule find something. */
const breaches: readonly (readonly [Rule, () => void])[] = [
  [
    agentsExists,
    () => {
      rmSync(join(root, 'AGENTS.md'));
    },
  ],
  [
    claudeLinksAgents,
    () => {
      rmSync(join(root, 'CLAUDE.md'));
      symlinkSync('nav', join(root, 'CLAUDE.md'));
    },
  ],
  [
    agentsWords,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', 'word '.repeat(500));
    },
  ],
  [
    resolveAgentsLinks,
    () => {
      writeRepositoryFile(root, 'AGENTS.md', 'See [gone](bur/gone.md).\n');
    },
  ],
  [
    judgeRecordsLayout,
    () => {
      writeRepositoryFile(root, 'notes.md', 'stray');
    },
  ],
  [
    judgeRecordNames,
    () => {
      writeRecord(root, 'bur/adr/a-decision.md', describeRecord('bur/adr/2031-04-07-x.md'));
    },
  ],
  [
    judgeRecordFrontMatter,
    () => {
      writeRepositoryFile(root, record, 'no front matter\n');
    },
  ],
  [
    judgeSupersession,
    () => {
      writeAdr({ supersedes: record });
    },
  ],
  [
    forbidPlaintextSecrets,
    () => {
      writeRepositoryFile(root, 'dash/notes.txt', `${credentialSamples[1]?.[1] ?? ''}\n`);
    },
  ],
  [
    forbidRecordsAddresses,
    () => {
      writeRepositoryFile(root, 'dash/ops/nodes.json', `{"address": "${forbiddenAddress}"}\n`);
    },
  ],
];

describe('every records rule has a breach it finds, and a remedy', () => {
  test('the breaches cover the records rule set exactly', () => {
    expect(new Set(breaches.map(([rule]) => rule))).toEqual(
      new Set(recordsRules.map(({ rule }) => rule)),
    );
  });

  test.each(breaches.map(([rule, breach]) => [rule.id, rule, breach] as const))(
    '%s finds its breach and names a remedy',
    (_id, rule, breach) => {
      breach();
      const findings = host.judge(rule, root, stateRoot());
      expect(findings.length).toBeGreaterThan(0);
      for (const finding of findings) expect(finding.remedy).not.toBe('');
    },
  );
});
