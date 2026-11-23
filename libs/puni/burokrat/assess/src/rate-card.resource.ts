import { parseJson } from '@puni/shared-checkout';
import { describeCause } from '@puni/shared-failures';
import type { FileSystem } from '@puni/shared-ports';
import type { RateCardResource } from './contract';
import { RateCardMalformed, RateCardUnreadable } from './failures';
import { readRateCard } from './rate-card';
import shippedCard from './rate-card.json' with { type: 'json' };

/** What the rate card resource needs from its host. */
export interface RateCardRequirements {
  readonly fileSystem: FileSystem;
}

/**
 * The {@link RateCardResource} of `fileSystem`. The shipped card, `rate-card.json` beside this
 * file, is a list-price card: each provider's published per-token prices on the day each entry
 * names, so a cost priced at it is API-equivalent, not what a subscription paid. It is read with
 * the same rules as a card given by path.
 */
export function createRateCards({ fileSystem }: RateCardRequirements): RateCardResource {
  return {
    load(path) {
      if (path === undefined)
        return { card: readRateCard(shippedCard, 'shipped'), source: 'shipped' };
      let text;
      try {
        text = fileSystem.readText(path);
      } catch (cause) {
        throw new RateCardUnreadable({ details: { path, reason: describeCause(cause) }, cause });
      }
      const parsed = parseJson(text);
      if ('problem' in parsed) {
        throw new RateCardMalformed({
          details: { source: path, problem: parsed.problem },
          cause: parsed.cause,
        });
      }
      return { card: readRateCard(parsed.value, path), source: path };
    },
  };
}
