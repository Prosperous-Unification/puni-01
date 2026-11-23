import type { Command } from '@puni/shared-command';
import type { RecordAddRequest, RecordFiling } from '@puni/shared-records';

/** A parsed `run log` request: the run's title, topics and summary, and its body file. */
export type RunLogRequest = RecordAddRequest<'run log'>;

/** What the run module needs from its host. */
export interface RunRequirements {
  readonly recordFiling: RecordFiling;
}

/** What the run module exports. */
export interface RunExports {
  readonly dashRunLogCommand: Command<RunLogRequest>;
}
