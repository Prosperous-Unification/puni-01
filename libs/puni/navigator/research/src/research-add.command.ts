import { createRecordAddCommand, type RecordAddLeaf, recordAddParser } from '@puni/shared-records';

/** `research add`: a `research` record, its body by default only a heading of its title. */
const researchAdd: RecordAddLeaf<'research add'> = {
  request: 'research add',
  kind: 'research',
  sections: [],
  noun: 'research',
  summarises: 'What the research found',
};

/** `add --title TEXT --topics LIST --summary TEXT [--body-file PATH]`: one research to file. */
export const researchAddParser = recordAddParser(researchAdd);

/**
 * The `research add` command: files the record in `nav/research` of the records repository as
 * `createRecordAddCommand` of `@puni/shared-records` says, every outcome and exit code included.
 */
export const createResearchAddCommand = createRecordAddCommand(researchAdd);
