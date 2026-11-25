import { createRecordAddCommand, type RecordAddLeaf, recordAddParser } from '@puni/shared-records';

/**
 * `run log`: an `assessment` record, because a run's outcome is a measured result; its body by
 * default empty Command, Outcome and Evidence sections.
 */
const runLog: RecordAddLeaf<'run log'> = {
  request: 'run log',
  kind: 'assessment',
  sections: ['Command', 'Outcome', 'Evidence'],
  noun: 'run',
  summarises: 'What the run measured',
};

/** `log`: one run to record, with the options of `recordAddParser`. */
export const runLogParser = recordAddParser(runLog);

/**
 * The `run log` command: files the run in `bur/assessments/` of the records repository as
 * `createRecordAddCommand` of `@puni/shared-records` says, every outcome and exit code included.
 */
export const createRunLogCommand = createRecordAddCommand(runLog);
