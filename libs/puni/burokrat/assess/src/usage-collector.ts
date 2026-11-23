import { describeValue, isRecord } from '@puni/shared-checkout';
import type {
  Harness,
  HarnessUsage,
  LogLine,
  SessionReferences,
  UsagePeriod,
  UsageRow,
  UsageTokens,
} from './contract';
import { HarnessLogMalformed } from './failures';
import { isInPeriod, readInstant } from './period';
import { isNoUsage } from './usage-tokens';

/** Reads the lines of one Codex rollout, in order; `finish` after its last line. */
export interface CodexRolloutReader {
  readLine(raw: string, at: LogLine): void;
  finish(): void;
}

/**
 * Folds harness log lines into the {@link HarnessUsage} of one period. Claude Code transcripts
 * are read line by line in any order, every file into one view; each Codex rollout is read
 * whole, in order, by its own reader.
 */
export interface UsageCollector {
  readClaudeLine(raw: string, at: LogLine): void;
  startCodexRollout(): CodexRolloutReader;
  /** The usage of every line read, rows oldest first. */
  collect(): HarnessUsage;
}

type Fields = Readonly<Record<string, unknown>>;

/** The line of `at` does not hold what usage is read from: `problem` says what. */
function malformed(at: LogLine, problem: string): never {
  throw new HarnessLogMalformed({ details: { ...at, problem } });
}

function readFields(value: unknown, where: string, at: LogLine): Fields {
  if (isRecord(value)) return value;
  return malformed(at, `has ${where} ${describeValue(value)}; expected an object`);
}

function readName(fields: Fields, key: string, where: string, at: LogLine): string {
  const value = fields[key];
  if (typeof value === 'string' && value !== '') return value;
  return malformed(at, `has ${where}${key} ${describeValue(value)}; expected a non-empty string`);
}

function readCount(fields: Fields, key: string, where: string, at: LogLine): number {
  const value = fields[key];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  return malformed(at, `has ${where}${key} ${describeValue(value)}; expected a count`);
}

function readOptionalCount(fields: Fields, key: string, where: string, at: LogLine): number {
  return fields[key] === undefined ? 0 : readCount(fields, key, where, at);
}

/** The branch a log names, none when it names none or the empty one. */
function readBranch(value: unknown, where: string, at: LogLine): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  return malformed(at, `has ${where} ${describeValue(value)}; expected a branch name`);
}

function readTimestamp(fields: Fields, at: LogLine): { spelled: string; instant: number } {
  const spelled = readName(fields, 'timestamp', '', at);
  const instant = readInstant(spelled);
  if (Number.isNaN(instant))
    malformed(at, `has timestamp ${JSON.stringify(spelled)}; expected an instant`);
  return { spelled, instant };
}

/**
 * The tokens of a Claude `message.usage`. `cache_creation_input_tokens` counts both cache
 * lifetimes; where `cache_creation` splits it, its hour-long part is the extended write.
 */
function readClaudeTokens(usage: Fields, at: LogLine): UsageTokens {
  const where = 'message.usage.';
  const split =
    usage['cache_creation'] === undefined
      ? undefined
      : readFields(usage['cache_creation'], `${where}cache_creation`, at);
  const written = readOptionalCount(usage, 'cache_creation_input_tokens', where, at);
  const extended =
    split === undefined ? 0 : readOptionalCount(split, 'ephemeral_1h_input_tokens', where, at);
  const short =
    split?.['ephemeral_5m_input_tokens'] === undefined
      ? Math.max(written - extended, 0)
      : readCount(split, 'ephemeral_5m_input_tokens', where, at);
  return {
    input: readCount(usage, 'input_tokens', where, at),
    cacheWrite: short,
    cacheWriteExtended: extended,
    cacheRead: readOptionalCount(usage, 'cache_read_input_tokens', where, at),
    output: readCount(usage, 'output_tokens', where, at),
  };
}

/** Whether two lines of one request agree on everything but output, which only grows. */
function sameInput(left: UsageTokens, right: UsageTokens): boolean {
  return (
    left.input === right.input &&
    left.cacheWrite === right.cacheWrite &&
    left.cacheWriteExtended === right.cacheWriteExtended &&
    left.cacheRead === right.cacheRead
  );
}

/** The cumulative counts of a Codex `total_token_usage`. */
interface CodexTotals {
  readonly input: number;
  readonly cached: number;
  readonly written: number;
  readonly output: number;
  readonly total: number;
}

function readCodexTotals(info: Fields, at: LogLine): CodexTotals {
  const where = 'payload.info.total_token_usage.';
  const totals = readFields(info['total_token_usage'], where.slice(0, -1), at);
  return {
    input: readCount(totals, 'input_tokens', where, at),
    cached: readCount(totals, 'cached_input_tokens', where, at),
    written: readCount(totals, 'cache_write_input_tokens', where, at),
    output: readCount(totals, 'output_tokens', where, at),
    total: readCount(totals, 'total_tokens', where, at),
  };
}

/**
 * A {@link UsageCollector} for `period`, collecting the pull requests of the repository
 * `repositorySlug` (`owner/name`) each session's lines link to.
 *
 * A line that is not JSON is skipped and listed: a live session leaves its last line torn while
 * it writes. A JSON line that is no object is no entry and is skipped. A JSON entry that lacks a
 * field usage is read from, or contradicts another, throws {@link HarnessLogMalformed}.
 *
 * Claude Code writes a line per streamed content block of a request, repeating its usage with
 * the output count growing, so a request is the line with the largest output of its session and
 * `requestId` (the last one written), across every file: a subagent's transcript, in
 * `<project>/<session>/subagents/`, carries its own requests. Its input and cache counts never
 * change; a repeat that changes them throws. An entry without a `requestId` is a synthetic one
 * with no usage; one with usage throws. A request counts in the period its kept line's
 * `timestamp` falls in.
 *
 * Codex repeats `token_count` events and restarts their counter within one rollout, so a row is
 * the advance of `total_token_usage` over the event before, per category, never
 * `last_token_usage`; a total lower than the one before is a restart, counted from zero. Its
 * `input_tokens` includes the cached ones, so the uncached input is the difference. A category
 * that falls while the total does not throws, as does a count before the rollout's
 * `session_meta` or `turn_context`.
 */
export function createUsageCollector(period: UsagePeriod, repositorySlug: string): UsageCollector {
  const escaped = repositorySlug.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pullRequestLink = new RegExp(`github\\.com/${escaped}/pull/(\\d+)`, 'gu');
  const rows: UsageRow[] = [];
  const unreadableLines: LogLine[] = [];
  const references = new Map<string, { harness: Harness; sessionId: string; pulls: Set<number> }>();
  interface ClaudeRequest {
    readonly row: UsageRow;
    readonly instant: number;
  }
  const requests = new Map<string, ClaudeRequest>();

  const parse = (raw: string, at: LogLine): Fields | undefined => {
    if (raw.trim() === '') return undefined;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (cause) {
      if (!(cause instanceof SyntaxError)) throw cause;
      unreadableLines.push(at);
      return undefined;
    }
    return isRecord(value) ? value : undefined;
  };
  const linkedPulls = (raw: string): number[] =>
    raw.includes('/pull/')
      ? [...raw.matchAll(pullRequestLink)].map((match) => Number(match[1]))
      : [];
  const addReferences = (harness: Harness, sessionId: string, pulls: Iterable<number>) => {
    const key = `${harness}\0${sessionId}`;
    const known = references.get(key) ?? { harness, sessionId, pulls: new Set<number>() };
    for (const pull of pulls) known.pulls.add(pull);
    references.set(key, known);
  };

  const readClaudeLine = (raw: string, at: LogLine): void => {
    const entry = parse(raw, at);
    if (entry === undefined) return;
    const pulls = linkedPulls(raw);
    if (pulls.length > 0 && typeof entry['sessionId'] === 'string') {
      addReferences('claude-code', entry['sessionId'], pulls);
    }
    if (entry['type'] !== 'assistant') return;
    const sessionId = readName(entry, 'sessionId', '', at);
    const { spelled, instant } = readTimestamp(entry, at);
    const message = readFields(entry['message'], 'message', at);
    const model = readName(message, 'model', 'message.', at);
    const tokens = readClaudeTokens(readFields(message['usage'], 'message.usage', at), at);
    if (entry['requestId'] === undefined) {
      if (!isNoUsage(tokens)) malformed(at, 'has usage but no requestId');
      return;
    }
    const requestId = readName(entry, 'requestId', '', at);
    const key = `${sessionId}\0${requestId}`;
    const earlier = requests.get(key);
    if (earlier !== undefined && !sameInput(earlier.row.tokens, tokens)) {
      malformed(
        at,
        `repeats request ${requestId} of ${earlier.row.source.path}:${String(earlier.row.source.line)} with other input counts`,
      );
    }
    if (earlier !== undefined && earlier.row.tokens.output > tokens.output) return;
    const row: UsageRow = {
      harness: 'claude-code',
      sessionId,
      model,
      instant: spelled,
      branch: readBranch(entry['gitBranch'], 'gitBranch', at),
      tokens,
      source: at,
    };
    requests.set(key, { row, instant });
  };

  const startCodexRollout = (): CodexRolloutReader => {
    let sessionId: string | undefined;
    let branch: string | null = null;
    let model: string | undefined;
    let previous: CodexTotals | undefined;
    const pulls = new Set<number>();
    return {
      readLine(raw, at) {
        const entry = parse(raw, at);
        for (const pull of linkedPulls(raw)) pulls.add(pull);
        if (entry === undefined) return;
        const payload = entry['payload'];
        if (entry['type'] === 'session_meta') {
          const meta = readFields(payload, 'payload', at);
          sessionId = readName(meta, 'id', 'payload.', at);
          const git = meta['git'];
          branch =
            git === undefined
              ? null
              : readBranch(readFields(git, 'payload.git', at)['branch'], 'payload.git.branch', at);
          return;
        }
        if (entry['type'] === 'turn_context') {
          model = readName(readFields(payload, 'payload', at), 'model', 'payload.', at);
          return;
        }
        if (
          entry['type'] !== 'event_msg' ||
          !isRecord(payload) ||
          payload['type'] !== 'token_count'
        ) {
          return;
        }
        const info = payload['info'];
        if (info === null || info === undefined) return;
        if (sessionId === undefined || model === undefined) {
          malformed(at, 'counts tokens before the rollout names its session and model');
        }
        const { spelled, instant } = readTimestamp(entry, at);
        const totals = readCodexTotals(readFields(info, 'payload.info', at), at);
        const base = previous === undefined || totals.total < previous.total ? undefined : previous;
        previous = totals;
        const advance = (key: keyof CodexTotals): number => totals[key] - (base?.[key] ?? 0);
        const [input, cached, written, output] = [
          advance('input'),
          advance('cached'),
          advance('written'),
          advance('output'),
        ];
        if (input < 0 || cached < 0 || written < 0 || output < 0) {
          malformed(at, 'has a cumulative count lower than the one before while its total is not');
        }
        const tokens: UsageTokens = {
          input: Math.max(input - cached, 0),
          cacheWrite: written,
          cacheWriteExtended: 0,
          cacheRead: cached,
          output,
        };
        if (isNoUsage(tokens) || !isInPeriod(instant, period)) return;
        rows.push({
          harness: 'codex',
          sessionId,
          model,
          instant: spelled,
          branch,
          tokens,
          source: at,
        });
      },
      finish() {
        if (sessionId !== undefined && pulls.size > 0) addReferences('codex', sessionId, pulls);
      },
    };
  };

  return {
    readClaudeLine,
    startCodexRollout,
    collect() {
      const claudeRows = [...requests.values()]
        .filter(({ row, instant }) => !isNoUsage(row.tokens) && isInPeriod(instant, period))
        .map(({ row }) => row);
      const sessions: SessionReferences[] = [...references.values()]
        .map(({ harness, sessionId, pulls }) => ({
          harness,
          sessionId,
          pullRequests: [...pulls].sort((left, right) => left - right),
        }))
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
      return {
        rows: [...rows, ...claudeRows].sort(
          (left, right) => readInstant(left.instant) - readInstant(right.instant),
        ),
        sessions,
        unreadableLines: [...unreadableLines],
      };
    },
  };
}
