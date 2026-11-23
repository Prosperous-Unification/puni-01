import type { Command } from '@puni/shared-command';
import type { RecordAddRequest, RecordFiling } from '@puni/shared-records';

/** A parsed `research add` request: the record's title, topics and summary, and its body file. */
export type ResearchAddRequest = RecordAddRequest<'research add'>;

/** What the research module needs from its host. */
export interface ResearchRequirements {
  readonly recordFiling: RecordFiling;
}

/** What the research module exports. */
export interface ResearchExports {
  readonly navigatorResearchAddCommand: Command<ResearchAddRequest>;
}
