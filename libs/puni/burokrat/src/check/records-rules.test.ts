import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeRecord,
  makeRecordsRepository,
  runGit,
  supersededRecord,
  supersedingRecord,
  writeRecord,
  writeRepositoryFile,
  fixtureCounterparts,
  formatFixtureConfig,
} from '../repository-fixture';
import {
  optionalRecordKeys,
  recordDirectories,
  recordKinds,
  recordsTopLevel,
  recordSummaryWordBudget,
  recordTopicLimit,
  requiredRecordKeys,
} from '../records-schema';
import { runCheck } from './check';
import type { Finding, Rule } from './finding';
import { repositoryScope } from './scope';
import {
  judgeRecordFrontMatter,
  judgeRecordNames,
  judgeRecordsLayout,
  judgeSupersession,
} from './records-rules';
import { recordsRules } from './rules';

let root = '';

beforeEach(() => {
  root = makeRecordsRepository();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function judge(rule: Rule): Finding[] {
  return rule({
    root,
    counterpart: fixtureCounterparts.records,
    commands: [],
    scope: repositoryScope,
  });
}

const record = 'bur/adr/2031-04-07-a-decision.md';

function writeAdr(extra: Readonly<Record<string, string>> = {}, drop?: string): void {
  const fields = describeRecord(record, extra);
  if (drop !== undefined) Reflect.deleteProperty(fields, drop);
  writeRecord(root, record, fields);
}

function frontMatterFinding(message: string): Finding[] {
  return [{ rule: 'records.front-matter', path: record, message }];
}

describe('the fixture records repository passes every records rule', () => {
  test.each(recordsRules.map((rule) => [rule.judge.name, rule.judge] as const))(
    '%s',
    (_name, rule) => {
      expect(judge(rule)).toEqual([]);
    },
  );

  test('a record in every kind directory passes', () => {
    for (const kind of recordKinds) {
      const path = `${recordDirectories[kind]}/2031-04-07-one-${kind}.md`;
      writeRecord(root, path, describeRecord(path));
    }
    expect(recordsRules.flatMap((rule) => judge(rule.judge))).toEqual([]);
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
    expect(recordsRules.flatMap((rule) => judge(rule.judge))).toEqual([]);
  });

  test('the same file without the ignore rule is a records.layout finding', () => {
    writeRepositoryFile(root, '.idea/workspace.xml', '<project/>');
    expect(judge(judgeRecordsLayout).map((finding) => finding.path)).toEqual(['.idea']);
  });

  test('an ignored record is invisible to every records rule', () => {
    writeRepositoryFile(root, '.gitignore', 'nav/plans/*-scratch.md\n');
    writeRepositoryFile(root, 'nav/plans/2031-04-08-scratch.md', 'no front matter\n');
    expect(recordsRules.flatMap((rule) => judge(rule.judge))).toEqual([]);
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
  ] as const)('git failing is a %s finding, not a pass', (rule, judgeRule) => {
    rmSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, '.git'));
    expect(judge(judgeRule)).toEqual([
      {
        rule,
        path: '.',
        message:
          'git ls-files exited 128: fatal: not a git repository (or any of the parent directories): .git',
      },
    ]);
  });
});

describe('records.layout', () => {
  test('every allowed top-level name passes', () => {
    for (const [name, type] of Object.entries(recordsTopLevel)) {
      if (type === 'directory') mkdirSync(join(root, name), { recursive: true });
      else if (name !== 'CLAUDE.md')
        writeRepositoryFile(root, name, formatFixtureConfig('records'));
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

describe('runCheck on a records repository', () => {
  function runIn(cwd: string): { code: 0 | 1 | 2; printed: string } {
    let printed = '';
    const code = runCheck(
      {},
      {
        cwd,
        stderr: (text) => {
          throw new Error(`unexpected stderr: ${text}`);
        },
        commands: [],
        stdout: (text) => {
          printed += text;
        },
      },
    );
    return { code, printed };
  }

  test('applies the records rule set and names the kind', () => {
    expect(runIn(join(root, 'nav/plans'))).toEqual({
      code: 0,
      printed: `ok: records, ${String(recordsRules.length)} rules, no findings.\n`,
    });
  });

  test('code-only rules do not apply: no README, index or package.json is needed', () => {
    writeRepositoryFile(root, 'dash/2031-04-05.md', 'dated and free form');
    expect(runIn(root).code).toBe(0);
  });

  test('a broken AGENTS.md link is a finding', () => {
    writeRepositoryFile(root, 'AGENTS.md', 'See [gone](bur/gone.md).\n');
    expect(runIn(root)).toEqual({
      code: 1,
      printed: `links.resolve AGENTS.md: links to missing bur/gone.md\nfail: records, ${String(recordsRules.length)} rules, 1 finding.\n`,
    });
  });
});
