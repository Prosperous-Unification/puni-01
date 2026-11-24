import { createRecordAddCommand, type RecordAddLeaf, recordAddParser } from '@puni/shared-records';

/** `adr add`: an `adr` record, its body by default a heading of its title and the empty sections every decision fills. */
const adrAdd: RecordAddLeaf<'adr add'> = {
  request: 'adr add',
  kind: 'adr',
  sections: ['Decision', 'Why', 'Options rejected'],
  noun: 'decision',
  summarises: 'What was decided',
};

/** `add --title TEXT --topics LIST --summary TEXT [--body-file PATH]`: one decision to file. */
export const adrAddParser = recordAddParser(adrAdd);

/**
 * The `adr add` command: files the record in `bur/adr` of the records repository as
 * `createRecordAddCommand` of `@puni/shared-records` says, every outcome and exit code included.
 */
export const createAdrAddCommand = createRecordAddCommand(adrAdd);
