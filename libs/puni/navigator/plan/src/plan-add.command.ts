import { createRecordAddCommand, type RecordAddLeaf, recordAddParser } from '@puni/shared-records';

/** `plan add`: a `plan` record, its body by default only a heading of its title. */
const planAdd: RecordAddLeaf<'plan add'> = {
  request: 'plan add',
  kind: 'plan',
  sections: [],
  noun: 'plan',
  summarises: 'What the plan decides',
};

/** `add --title TEXT --topics LIST --summary TEXT [--body-file PATH]`: one plan to file. */
export const planAddParser = recordAddParser(planAdd);

/**
 * The `plan add` command: files the plan in `nav/plans/` of the records repository as
 * `createRecordAddCommand` of `@puni/shared-records` says, every outcome and exit code included.
 */
export const createPlanAddCommand = createRecordAddCommand(planAdd);
