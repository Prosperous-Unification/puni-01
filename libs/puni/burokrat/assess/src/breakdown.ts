import type {
  AcceptedOutcome,
  HarnessUsage,
  LoadedRateCard,
  ModelUsage,
  OutcomeBreakdown,
  OutcomeCharge,
  RemainderReason,
  UnpricedUsage,
  UsagePeriod,
  UsageTokens,
} from './contract';
import { createAttribution } from './attribution';
import { priceTokens } from './pricing';
import { addTokens, noTokens } from './usage-tokens';

/** Every remainder reason, in the order a breakdown lists them. */
export const remainderReasons: readonly RemainderReason[] = [
  'ambiguous-references',
  'no-branch',
  'on-default-branch',
  'branch-not-accepted',
];

interface Charge {
  micros: number;
  rows: number;
  readonly sessions: Set<string>;
  readonly models: Set<string>;
  readonly rules: Record<'pull-request-reference' | 'branch', number>;
}

/**
 * Prices every row of `usage` at the rate card and charges it to an outcome or the remainder, as
 * {@link createAttribution} says. An unpriced row is charged nowhere and listed by its harness,
 * model and reason. Pure.
 */
export function buildBreakdown(input: {
  readonly usage: HarnessUsage;
  readonly outcomes: readonly AcceptedOutcome[];
  readonly rateCard: LoadedRateCard;
  readonly period: UsagePeriod;
  readonly repository: string;
}): OutcomeBreakdown {
  const attribute = createAttribution(input.outcomes);
  const references = new Map(
    input.usage.sessions.map((session) => [
      `${session.harness}\0${session.sessionId}`,
      session.pullRequests,
    ]),
  );
  const charges = new Map<string, Charge>(
    input.outcomes.map((outcome) => [
      outcome.mergeHash,
      {
        micros: 0,
        rows: 0,
        sessions: new Set(),
        models: new Set(),
        rules: { 'pull-request-reference': 0, branch: 0 },
      },
    ]),
  );
  const remainder: Record<RemainderReason, number> = {
    'ambiguous-references': 0,
    'no-branch': 0,
    'on-default-branch': 0,
    'branch-not-accepted': 0,
  };
  const unpriced = new Map<string, UnpricedUsage>();
  const models = new Map<string, ModelUsage>();
  let pricedMicros = 0;
  let attributedMicros = 0;
  const addModelUsage = (
    harness: ModelUsage['harness'],
    model: string,
    tokens: UsageTokens,
    micros: number | null,
  ) => {
    const key = `${harness}\0${model}`;
    const known = models.get(key);
    models.set(key, {
      harness,
      model,
      rows: (known?.rows ?? 0) + 1,
      tokens: addTokens(known?.tokens ?? noTokens, tokens),
      micros:
        known === undefined
          ? micros
          : known.micros === null || micros === null
            ? null
            : known.micros + micros,
    });
  };
  for (const row of input.usage.rows) {
    const priced = priceTokens(input.rateCard.card, row.model, row.tokens);
    if (priced.kind === 'unpriced') {
      addModelUsage(row.harness, row.model, row.tokens, null);
      const key = `${row.harness}\0${row.model}\0${priced.reason}`;
      const known = unpriced.get(key);
      unpriced.set(key, {
        harness: row.harness,
        model: row.model,
        reason: priced.reason,
        rows: (known?.rows ?? 0) + 1,
        tokens: addTokens(known?.tokens ?? noTokens, row.tokens),
      });
      continue;
    }
    addModelUsage(row.harness, row.model, row.tokens, priced.micros);
    pricedMicros += priced.micros;
    const attribution = attribute(row, references.get(`${row.harness}\0${row.sessionId}`) ?? []);
    if (attribution.kind === 'remainder') {
      remainder[attribution.reason] += priced.micros;
      continue;
    }
    const charge = charges.get(attribution.mergeHash);
    if (charge === undefined) {
      throw new Error(`attribution named ${attribution.mergeHash}, which is no accepted outcome`);
    }
    attributedMicros += priced.micros;
    charge.micros += priced.micros;
    charge.rows += 1;
    charge.sessions.add(row.sessionId);
    charge.models.add(row.model);
    charge.rules[attribution.rule] += 1;
  }
  const outcomes: OutcomeCharge[] = input.outcomes.map((outcome) => {
    const charge = charges.get(outcome.mergeHash);
    if (charge === undefined) throw new Error(`no charge was opened for ${outcome.mergeHash}`);
    return {
      ...outcome,
      micros: charge.micros,
      rows: charge.rows,
      sessions: [...charge.sessions].sort(),
      models: [...charge.models].sort(),
      rules: charge.rules,
    };
  });
  const count = input.outcomes.length;
  const byName = <Value extends { harness: string; model: string }>(left: Value, right: Value) =>
    `${left.harness} ${left.model}`.localeCompare(`${right.harness} ${right.model}`);
  return {
    period: input.period,
    repository: input.repository,
    rateCard: input.rateCard.source,
    currency: input.rateCard.card.currency,
    acceptedOutcomes: count,
    pricedMicros,
    attributedMicros,
    coverage:
      pricedMicros === 0 ? null : Math.round((attributedMicros / pricedMicros) * 10_000) / 10_000,
    microsPerOutcome: count === 0 ? null : Math.round(pricedMicros / count),
    remainderMicros: remainder,
    unpriced: [...unpriced.values()].sort(byName),
    models: [...models.values()].sort(byName),
    outcomes,
    rows: input.usage.rows.length,
    unreadableLines: input.usage.unreadableLines,
  };
}
