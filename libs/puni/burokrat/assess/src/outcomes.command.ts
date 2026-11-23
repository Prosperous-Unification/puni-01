import { constant, message, multiple, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { OutcomeAssessment, OutcomeBreakdown, OutcomesRequest } from './contract';

/**
 * `outcomes --since INSTANT --until INSTANT [--rate-card PATH] [--claude-projects DIR]...
 * [--codex-sessions DIR]... [--json]`: the period to assess and where its inputs are.
 */
export const outcomesParser = object({
  kind: constant('assess outcomes'),
  since: option('--since', string({ metavar: 'INSTANT' }), {
    description: message`The start of the period, included, in UTC, such as 2026-11-22T00:00:00Z.`,
  }),
  until: option('--until', string({ metavar: 'INSTANT' }), {
    description: message`The end of the period, excluded, in UTC.`,
  }),
  rateCard: optional(
    option('--rate-card', string({ metavar: 'PATH' }), {
      description: message`The rate card to price with (default: the shipped list prices).`,
    }),
  ),
  claudeProjects: multiple(
    option('--claude-projects', string({ metavar: 'DIR' }), {
      description: message`A Claude Code projects directory; repeatable (default: ~/.claude/projects).`,
    }),
  ),
  codexSessions: multiple(
    option('--codex-sessions', string({ metavar: 'DIR' }), {
      description: message`A Codex sessions directory; repeatable (default: ~/.codex/sessions).`,
    }),
  ),
  json: option('--json', {
    description: message`Print the whole breakdown as JSON instead of the summary.`,
  }),
});

/** `micros` millionths of `currency` as money to the cent; `n/a` for none. */
function formatMoney(micros: number | null, currency: string): string {
  return micros === null ? 'n/a' : `${(micros / 1_000_000).toFixed(2)} ${currency}`;
}

/** The summary of `breakdown`, one fact per line. */
function formatSummary(breakdown: OutcomeBreakdown): string {
  const { currency } = breakdown;
  const money = (micros: number | null) => formatMoney(micros, currency);
  const coverage =
    breakdown.coverage === null ? 'n/a' : `${(breakdown.coverage * 100).toFixed(1)}%`;
  const remainder = Object.entries(breakdown.remainderMicros);
  const unpricedRows = breakdown.unpriced.reduce((sum, group) => sum + group.rows, 0);
  const lines = [
    `${breakdown.repository} from ${breakdown.period.since} to ${breakdown.period.until}`,
    `accepted outcomes: ${String(breakdown.acceptedOutcomes)}`,
    `cost: ${money(breakdown.pricedMicros)} API-equivalent at the ${breakdown.rateCard} rate card, ${String(breakdown.rows)} usage rows`,
    `per outcome: ${money(breakdown.microsPerOutcome)}`,
    `attributed: ${money(breakdown.attributedMicros)}, coverage ${coverage}`,
    `remainder: ${money(breakdown.pricedMicros - breakdown.attributedMicros)}`,
    ...remainder.map(([reason, micros]) => `  ${reason}: ${money(micros)}`),
    `unpriced: ${String(unpricedRows)} rows`,
    ...breakdown.unpriced.map(
      ({ harness, model, reason, rows }) =>
        `  ${harness} ${model}: ${String(rows)} rows, ${reason}`,
    ),
    `unreadable lines skipped: ${String(breakdown.unreadableLines.length)}`,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * The `assess outcomes` command: prints the summary of what the agent work of the period cost per
 * accepted outcome (the outcomes, the priced cost, the cost per outcome, the attributed cost and
 * its share, the remainder by reason, the unpriced rows and the unreadable lines skipped), or
 * with `json` the whole breakdown as JSON, and returns 0. A period that is none prints one
 * `error:` line and returns 2; an input that cannot be read or is malformed, the repository
 * included, prints one `error:` line and returns 1.
 */
export function createOutcomesCommand({
  outcomeAssessment,
}: {
  outcomeAssessment: OutcomeAssessment;
}): Command<OutcomesRequest> {
  return {
    run(request, io) {
      const outcome = outcomeAssessment.assess(io.cwd, request);
      switch (outcome.kind) {
        case 'assessed':
          io.stdout(
            request.json
              ? `${JSON.stringify(outcome.breakdown, null, 2)}\n`
              : formatSummary(outcome.breakdown),
          );
          return 0;
        case 'refused':
          io.stderr(`error: ${outcome.reason}\n`);
          return 2;
        case 'failed':
          io.stderr(`error: ${outcome.reason}\n`);
          return 1;
      }
    },
  };
}
