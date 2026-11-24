import { describe, expect, test } from 'bun:test';
import { checkoutModule, formatRegistry } from '@puni/shared-checkout';
import { recordsModule } from '@puni/shared-records';
import type { GitMerge } from '@puni/shared-ports';
import {
  closeAfterEach,
  fixtureRemotes,
  memoryHome,
  type MemoryHostOptions,
  type MemoryTree,
  memoryHost,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { OutcomeBreakdown, OutcomesRequest } from './contract';
import { burokratAssessModule } from './module';

const track = closeAfterEach();

const state = '/w/demo';
const claudeProjects = `${memoryHome}/.claude/projects`;
const codexSessions = `${memoryHome}/.codex/sessions`;
const period = { since: '2026-11-22T00:00:00Z', until: '2026-11-23T00:00:00Z' } as const;

/** Prices per million tokens of the two fixture models. */
const card = {
  schemaVersion: 1,
  currency: 'USD',
  unit: 'perMillionTokens',
  entries: [
    {
      provider: 'anthropic',
      model: 'claude-test',
      prices: { input: 1, cacheWrite: 2, cacheWriteExtended: 3, cacheRead: 0.5, output: 10 },
      source: 'https://example.com/claude',
      accessedAt: '2026-11-22',
    },
    {
      provider: 'openai',
      model: 'gpt-test',
      prices: { input: 1, cacheWrite: 1, cacheRead: 0.1, output: 4 },
      source: 'https://example.com/openai',
      accessedAt: '2026-11-22',
    },
  ],
};

interface ClaudeLine {
  readonly session: string;
  readonly request?: string;
  readonly at?: string;
  readonly branch?: string;
  readonly model?: string;
  readonly input?: number;
  readonly output?: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: { readonly short: number; readonly extended: number };
}

/** One Claude Code assistant transcript line. */
function claude(line: ClaudeLine): string {
  const write = line.cacheWrite;
  return JSON.stringify({
    type: 'assistant',
    sessionId: line.session,
    timestamp: line.at ?? '2026-11-22T10:00:00.000Z',
    version: '2.1.0',
    ...(line.request === undefined ? {} : { requestId: line.request }),
    ...(line.branch === undefined ? {} : { gitBranch: line.branch }),
    message: {
      model: line.model ?? 'claude-test',
      usage: {
        input_tokens: line.input ?? 0,
        output_tokens: line.output ?? 0,
        cache_read_input_tokens: line.cacheRead ?? 0,
        cache_creation_input_tokens: write === undefined ? 0 : write.short + write.extended,
        ...(write === undefined
          ? {}
          : {
              cache_creation: {
                ephemeral_5m_input_tokens: write.short,
                ephemeral_1h_input_tokens: write.extended,
              },
            }),
      },
    },
  });
}

/** A Claude Code line that only links to `pull`, as a tool's output would. */
function claudeLink(session: string, ...pulls: number[]): string {
  const text = pulls.map((pull) => `https://github.com/acme/demo/pull/${String(pull)}`).join(' ');
  return JSON.stringify({ type: 'user', sessionId: session, message: { content: text } });
}

const codexMeta = (id: string, branch: string) =>
  JSON.stringify({ type: 'session_meta', payload: { id, cli_version: '0.1', git: { branch } } });
const codexModel = (model: string) => JSON.stringify({ type: 'turn_context', payload: { model } });

/** A Codex `token_count` event with cumulative totals; `last_token_usage` is never read. */
function codexCount(at: string, input: number, cached: number, output: number): string {
  const usage = {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: output,
    total_tokens: input + output,
  };
  const misleading = { ...usage, input_tokens: 9e9, output_tokens: 9e9, total_tokens: 18e9 };
  return JSON.stringify({
    type: 'event_msg',
    timestamp: at,
    payload: {
      type: 'token_count',
      info: { total_token_usage: usage, last_token_usage: misleading },
    },
  });
}

const merge = (hash: string, mergedAt: string, subject: string): GitMerge => ({
  hash,
  committedAt: new Date(mergedAt),
  subject,
});
const [m0, m1, m2] = ['0'.repeat(40), '1'.repeat(40), '2'.repeat(40)];

/** `main` merged #5 the day before, then #7 (feat-a) and #8 (feat-b, which merged #6, feat-c). */
const merges: NonNullable<MemoryHostOptions['merges']> = {
  [state]: {
    'first-parent main': [
      merge(m2, '2026-11-22T20:00:00Z', 'Merge pull request #8 from acme/feat-b'),
      merge(m1, '2026-11-22T12:00:00Z', 'Merge pull request #7 from acme/feat-a'),
      merge(m0, '2026-11-21T12:00:00Z', 'Merge pull request #5 from acme/feat-z'),
    ],
    [`all ${m1}^1..${m1}`]: [
      merge(m1, '2026-11-22T12:00:00Z', 'Merge pull request #7 from acme/feat-a'),
    ],
    [`all ${m2}^1..${m2}`]: [
      merge(m2, '2026-11-22T20:00:00Z', 'Merge pull request #8 from acme/feat-b'),
      merge('6'.repeat(40), '2026-11-22T18:00:00Z', 'Merge pull request #6 from acme/feat-c'),
    ],
  },
};

const lines = (...entries: readonly string[]) => `${entries.join('\n')}\n`;

/**
 * Every case at once. Costs at {@link card}, in millionths of a dollar: feat-a 1,001,000 (a
 * request streamed in three lines) and 1,300,000 (a subagent's cache traffic); #8 by reference
 * 2,000,000; feat-c by Codex 3,550,000; the remainder 300,000 ambiguous, 210,000 with no branch,
 * 500,000 on main and 100,000 on a branch no outcome merged.
 */
const tree: MemoryTree = {
  [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes),
  [`${state}/card.json`]: JSON.stringify(card),
  [`${claudeProjects}/-w-demo/s1.jsonl`]: lines(
    claudeLink('s1'),
    claude({ session: 's1', request: 'r1', branch: 'feat-a', input: 1000, output: 10_000 }),
    claude({ session: 's1', request: 'r1', branch: 'feat-a', input: 1000, output: 50_000 }),
    claude({ session: 's1', request: 'r1', branch: 'feat-a', input: 1000, output: 100_000 }),
    claude({ session: 's1', branch: 'feat-a', model: '<synthetic>' }),
    '{"type":"assistant","sess',
  ),
  [`${claudeProjects}/-w-demo/s1/subagents/agent-a.jsonl`]: lines(
    claude({
      session: 's1',
      request: 'r2',
      at: '2026-11-22T11:00:00.000Z',
      branch: 'feat-a',
      cacheWrite: { short: 100_000, extended: 200_000 },
      cacheRead: 1_000_000,
    }),
  ),
  [`${claudeProjects}/-w-other/s2.jsonl`]: lines(
    claudeLink('s2', 8),
    claude({ session: 's2', request: 'r3', branch: 'main', output: 200_000 }),
    claude({ session: 's3', request: 'r4', branch: 'main', output: 50_000 }),
    claudeLink('s4', 7, 8),
    claude({ session: 's4', request: 'r5', branch: 'feat-a', output: 30_000 }),
    claude({
      session: 's5',
      request: 'r6',
      branch: 'feat-a',
      model: 'claude-unknown',
      output: 1000,
    }),
    claude({ session: 's6', request: 'r7', at: '2026-11-23T00:00:00.000Z', output: 1000 }),
    claude({ session: 's7', request: 'r8', branch: 'experiment', output: 10_000 }),
    claude({ session: 's8', request: 'r9', output: 21_000 }),
  ),
  [`${codexSessions}/2026/11/22/rollout-1.jsonl`]: lines(
    codexMeta('c1', 'feat-c'),
    codexModel('gpt-test'),
    codexCount('2026-11-22T10:00:00.000Z', 1_000_000, 400_000, 100_000),
    codexCount('2026-11-22T10:00:01.000Z', 1_000_000, 400_000, 100_000),
    codexCount('2026-11-22T10:05:00.000Z', 3_000_000, 1_400_000, 300_000),
    codexCount('2026-11-22T10:10:00.000Z', 500_000, 100_000, 50_000),
    '{"type":"event_msg","timest',
  ),
  [`${codexSessions}/2026/11/01/rollout-0.jsonl`]: lines(
    codexMeta('c0', 'feat-c'),
    codexModel('gpt-test'),
    codexCount('2026-11-22T10:00:00.000Z', 1_000_000, 0, 0),
    'torn',
  ),
};

const options: MemoryHostOptions = {
  merges,
  modified: { [`${codexSessions}/2026/11/01/rollout-0.jsonl`]: new Date('2026-11-01T12:00:00Z') },
};

const request: OutcomesRequest = {
  kind: 'assess outcomes',
  ...period,
  rateCard: 'card.json',
  claudeProjects: [],
  codexSessions: [],
  json: false,
};

function assess(
  changes: Partial<OutcomesRequest> = {},
  fixture: MemoryTree = tree,
  hostOptions: MemoryHostOptions = options,
) {
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule, burokratAssessModule])
      .withServices(memoryHost(fixture, hostOptions).services)
      .buildContainer(),
  );
  let stdout = '';
  let stderr = '';
  const code = container.resolve('burokratAssessOutcomesCommand').run(
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
}

function readBreakdown(
  changes: Partial<OutcomesRequest> = {},
  fixture: MemoryTree = tree,
  hostOptions: MemoryHostOptions = options,
): OutcomeBreakdown {
  const run = assess({ ...changes, json: true }, fixture, hostOptions);
  expect([run.code, run.stderr]).toEqual([0, '']);
  return JSON.parse(run.stdout) as OutcomeBreakdown;
}

/** The tokens and cost the breakdown gives `model`. */
function modelUsage(breakdown: OutcomeBreakdown, model: string) {
  return breakdown.models.find((usage) => usage.model === model);
}

describe('burokrat assess outcomes', () => {
  test('prints the summary of the period and exits 0', () => {
    expect(assess()).toEqual({
      code: 0,
      stderr: '',
      stdout: [
        'acme/demo from 2026-11-22T00:00:00.000Z to 2026-11-23T00:00:00.000Z',
        'accepted outcomes: 2',
        'cost: 8.96 USD API-equivalent at the /w/demo/card.json rate card, 11 usage rows',
        'per outcome: 4.48 USD',
        'attributed: 7.85 USD, coverage 87.6%',
        'remainder: 1.11 USD',
        '  ambiguous-references: 0.30 USD',
        '  no-branch: 0.21 USD',
        '  on-default-branch: 0.50 USD',
        '  branch-not-accepted: 0.10 USD',
        'unpriced: 1 rows',
        '  claude-code claude-unknown: 1 rows, unknown-model',
        'unreadable lines skipped: 2',
        '',
      ].join('\n'),
    });
  });

  test('a Claude request streamed in several lines counts once, at its last line', () => {
    const usage = modelUsage(readBreakdown(), 'claude-test');
    expect(usage?.rows).toBe(7);
    expect(usage?.tokens.input).toBe(1000);
    expect(usage?.tokens.output).toBe(100_000 + 200_000 + 50_000 + 30_000 + 10_000 + 21_000);
  });

  test('a subagent transcript below its session directory is read, its cache writes split', () => {
    const usage = modelUsage(readBreakdown(), 'claude-test');
    expect(usage?.tokens).toMatchObject({
      cacheWrite: 100_000,
      cacheWriteExtended: 200_000,
      cacheRead: 1_000_000,
    });
  });

  test('a repeated request whose input counts differ is malformed: exit 1', () => {
    const repeated = {
      ...tree,
      [`${claudeProjects}/-w-demo/s9.jsonl`]: lines(
        claude({ session: 's9', request: 'r', input: 1, output: 1 }),
        claude({ session: 's9', request: 'r', input: 2, output: 2 }),
      ),
    };
    const run = assess({}, repeated);
    expect([run.code, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toBe(
      `error: the harness log ${claudeProjects}/-w-demo/s9.jsonl:2 repeats request r of ${claudeProjects}/-w-demo/s9.jsonl:1 with other input counts\n`,
    );
  });

  test('a synthetic entry without a requestId is dropped; one carrying usage is malformed', () => {
    expect(readBreakdown().models.map(({ model }) => model)).not.toContain('<synthetic>');
    const run = assess(
      {},
      {
        ...tree,
        [`${claudeProjects}/-w-demo/s9.jsonl`]: lines(claude({ session: 's9', output: 5 })),
      },
    );
    expect([run.code, run.stderr]).toEqual([
      1,
      `error: the harness log ${claudeProjects}/-w-demo/s9.jsonl:1 has usage but no requestId\n`,
    ]);
  });

  test('Codex usage is the advance of its cumulative totals: repeats once, restarts from zero, cached input apart', () => {
    expect(modelUsage(readBreakdown(), 'gpt-test')).toEqual({
      harness: 'codex',
      model: 'gpt-test',
      rows: 3,
      tokens: {
        input: 600_000 + 1_000_000 + 400_000,
        cacheWrite: 0,
        cacheWriteExtended: 0,
        cacheRead: 400_000 + 1_000_000 + 100_000,
        output: 100_000 + 200_000 + 50_000,
      },
      micros: 3_550_000,
    });
  });

  test('a Codex count that falls while its total does not is malformed', () => {
    const falling = JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-11-22T11:00:00.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: 1_000_000_000,
            total_tokens: 1_000_000_010,
          },
        },
      },
    });
    const path = `${codexSessions}/2026/11/22/rollout-1.jsonl`;
    const run = assess({}, { ...tree, [path]: `${tree[path] as string}${falling}\n` });
    expect([run.code, run.stderr]).toEqual([
      1,
      `error: the harness log ${path}:8 has a cumulative count lower than the one before while its total is not\n`,
    ]);
  });

  test('torn lines are skipped and listed, never fatal', () => {
    expect(readBreakdown().unreadableLines).toEqual([
      { path: `${claudeProjects}/-w-demo/s1.jsonl`, line: 6 },
      { path: `${codexSessions}/2026/11/22/rollout-1.jsonl`, line: 7 },
    ]);
  });

  test('a log last modified before the period is not read', () => {
    const breakdown = readBreakdown({}, tree, { merges });
    expect(breakdown.unreadableLines).toContainEqual({
      path: `${codexSessions}/2026/11/01/rollout-0.jsonl`,
      line: 4,
    });
    expect(breakdown.rows).toBe(12);
  });

  test('an unknown model is reported unpriced, never priced at a default', () => {
    const breakdown = readBreakdown();
    expect(breakdown.unpriced).toEqual([
      {
        harness: 'claude-code',
        model: 'claude-unknown',
        reason: 'unknown-model',
        rows: 1,
        tokens: { input: 0, cacheWrite: 0, cacheWriteExtended: 0, cacheRead: 0, output: 1000 },
      },
    ]);
    expect(modelUsage(breakdown, 'claude-unknown')?.micros).toBeNull();
  });

  test('a category the entry does not price leaves the row unpriced', () => {
    const extended = {
      ...tree,
      [`${codexSessions}/2026/11/22/rollout-1.jsonl`]: lines(codexMeta('c1', 'feat-c')),
      [`${claudeProjects}/-w-other/s2.jsonl`]: '',
      [`${claudeProjects}/-w-demo/s1.jsonl`]: '',
      [`${claudeProjects}/-w-demo/s1/subagents/agent-a.jsonl`]: lines(
        claude({
          session: 's1',
          request: 'r2',
          model: 'gpt-test',
          cacheWrite: { short: 0, extended: 10 },
        }),
      ),
    };
    expect(readBreakdown({}, extended).unpriced.map(({ reason }) => reason)).toEqual([
      'missing-category',
    ]);
  });

  test('each outcome is charged by pull request reference, head branch or member branch', () => {
    const outcomes = readBreakdown().outcomes.map(
      ({
        pullRequest,
        headBranch,
        nestedPullRequests,
        memberBranches,
        micros,
        rules,
        sessions,
      }) => ({
        pullRequest,
        headBranch,
        nestedPullRequests,
        memberBranches,
        micros,
        rules,
        sessions,
      }),
    );
    expect(outcomes).toEqual([
      {
        pullRequest: 7,
        headBranch: 'feat-a',
        nestedPullRequests: [],
        memberBranches: [],
        micros: 2_301_000,
        rules: { 'pull-request-reference': 0, branch: 2 },
        sessions: ['s1'],
      },
      {
        pullRequest: 8,
        headBranch: 'feat-b',
        nestedPullRequests: [6],
        memberBranches: ['feat-c'],
        micros: 5_550_000,
        rules: { 'pull-request-reference': 1, branch: 3 },
        sessions: ['c1', 's2'],
      },
    ]);
  });

  test('a branch two outcomes merged goes to the first merged at or after the row, else the last', () => {
    const reused = {
      [state]: {
        ...merges[state],
        'first-parent main': [
          merge(m2, '2026-11-22T20:00:00Z', 'Merge pull request #8 from acme/feat-a'),
          merge(m1, '2026-11-22T12:00:00Z', 'Merge pull request #7 from acme/feat-a'),
        ],
        [`all ${m2}^1..${m2}`]: [],
      },
    };
    const late = {
      ...tree,
      [`${claudeProjects}/-w-demo/late.jsonl`]: lines(
        claude({
          session: 'late',
          request: 'x',
          at: '2026-11-22T21:00:00.000Z',
          branch: 'feat-a',
          output: 1,
        }),
      ),
    };
    const sessions = readBreakdown({}, late, { ...options, merges: reused }).outcomes.map(
      (outcome) => outcome.sessions,
    );
    expect(sessions).toEqual([['s1'], ['late', 's2']]);
  });

  test('the shipped list-price card is used when none is given', () => {
    const shipped = {
      ...tree,
      [`${claudeProjects}/-w-demo/s1.jsonl`]: lines(
        claude({ session: 's1', request: 'r1', model: 'claude-opus-5-5', input: 1_000_000 }),
      ),
    };
    const breakdown = readBreakdown({ rateCard: undefined }, shipped);
    expect([breakdown.rateCard, modelUsage(breakdown, 'claude-opus-5-5')?.micros]).toEqual([
      'shipped',
      4_000_000,
    ]);
  });

  test('log directories given on the command line replace the defaults, relative ones read from the repository', () => {
    const elsewhere = {
      [`${state}/puni.json`]: tree[`${state}/puni.json`] ?? '',
      [`${state}/card.json`]: JSON.stringify(card),
      [`${state}/logs/claude/p/s.jsonl`]: lines(claude({ session: 's', request: 'r', output: 1 })),
      [`${state}/logs/codex/r.jsonl`]: lines(codexMeta('c', 'x'), codexModel('gpt-test')),
    };
    const breakdown = readBreakdown(
      { claudeProjects: ['logs/claude'], codexSessions: [`${state}/logs/codex`] },
      elsewhere,
    );
    expect(breakdown.rows).toBe(1);
  });

  test('a period that is none is refused: exit 2', () => {
    expect(assess({ until: period.since })).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: the period is refused: ${period.since} is not after ${period.since}\n`,
    });
    expect(assess({ since: '2026-02-30T00:00:00Z' }).code).toBe(2);
    expect(assess({ since: '2026-11-22' }).stderr).toBe(
      'error: the period is refused: 2026-11-22 is no UTC instant\n',
    );
  });

  test.each([
    [
      'a missing rate card',
      { rateCard: 'none.json' },
      tree,
      `error: the rate card ${state}/none.json cannot be read: ENOENT: ${state}/none.json\n`,
    ],
    [
      'a rate card that is no JSON',
      {},
      { ...tree, [`${state}/card.json`]: '{' },
      `error: the rate card ${state}/card.json is not valid JSON: `,
    ],
    [
      'a rate card listing a model twice',
      {},
      {
        ...tree,
        [`${state}/card.json`]: JSON.stringify({
          ...card,
          entries: [...card.entries, ...card.entries],
        }),
      },
      `error: the rate card ${state}/card.json lists the model claude-test twice\n`,
    ],
    [
      'a missing log directory',
      { codexSessions: ['/nowhere'] },
      tree,
      'error: the harness log /nowhere cannot be read: nothing is there\n',
    ],
    [
      'no repository',
      {},
      { [`${state}/card.json`]: JSON.stringify(card) },
      `error: no puni.json in ${state} or any directory above it; `,
    ],
  ] as const)('%s fails with one error line: exit 1', (_name, changes, fixture, error) => {
    const run = assess(changes, fixture);
    expect([run.code, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toStartWith(error);
  });

  test('a repository whose merges git cannot list fails: exit 1', () => {
    const run = assess({}, tree, {});
    expect([run.code, run.stderr]).toEqual([
      1,
      `error: the merges into main of ${state} cannot be listed: unknown revision main in ${state}\n`,
    ]);
  });
});
