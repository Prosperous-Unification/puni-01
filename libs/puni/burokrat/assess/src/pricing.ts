import type { RateCard, UnpricedReason, UsageTokens } from './contract';
import { usageCategories } from './usage-tokens';

/** What `tokens` cost in millionths of the card's currency, or why they cannot be priced. */
export type Priced =
  | { readonly kind: 'priced'; readonly micros: number }
  | { readonly kind: 'unpriced'; readonly reason: UnpricedReason };

/**
 * Prices `tokens` of `model` at `card`: per category, tokens times the per-million price is
 * millionths of the currency, rounded once per category. A model the card does not list, or a
 * non-zero category its entry does not price, leaves the tokens unpriced with the reason; they
 * are never priced at zero or at another model's prices.
 */
export function priceTokens(card: RateCard, model: string, tokens: UsageTokens): Priced {
  const entry = card.entries.find((candidate) => candidate.model === model);
  if (entry === undefined) return { kind: 'unpriced', reason: 'unknown-model' };
  let micros = 0;
  for (const category of usageCategories) {
    const count = tokens[category];
    if (count === 0) continue;
    const price = entry.prices[category];
    if (price === undefined) return { kind: 'unpriced', reason: 'missing-category' };
    micros += Math.round(count * price);
  }
  return { kind: 'priced', micros };
}
