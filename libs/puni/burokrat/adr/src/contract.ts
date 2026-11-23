import type { Command } from '@puni/shared-command';
import type { RecordAddRequest, RecordFiling } from '@puni/shared-records';

/** A parsed `adr add` request: the record's title, topics and summary, and its body file. */
export type AdrAddRequest = RecordAddRequest<'adr add'>;

/** What the adr module needs from its host. */
export interface AdrRequirements {
  readonly recordFiling: RecordFiling;
}

/** What the adr module exports. */
export interface AdrExports {
  readonly burokratAdrAddCommand: Command<AdrAddRequest>;
}
