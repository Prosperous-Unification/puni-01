import type { Command } from '@puni/shared-command';
import type { RecordAddRequest, RecordFiling } from '@puni/shared-records';

/** A parsed `plan add` request: the plan's title, topics and summary, and its body file. */
export type PlanAddRequest = RecordAddRequest<'plan add'>;

/** What the plan module needs from its host. */
export interface PlanRequirements {
  readonly recordFiling: RecordFiling;
}

/** What the plan module exports. */
export interface PlanExports {
  readonly navigatorPlanAddCommand: Command<PlanAddRequest>;
}
