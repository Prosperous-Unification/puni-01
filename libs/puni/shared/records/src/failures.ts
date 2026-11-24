import { defineException } from 'application-exception';

/** A record kind directory that is not `group/name`: a defect in the records schema. */
export const RecordDirectoryInvalid = defineException({
  tag: 'puni/shared-records/RecordDirectoryInvalid',
  message: ({ directory }: { directory: string }) => `${directory} is not group/name`,
});

/** A value a new record would hold that the records schema refuses: a refused command line. */
export const RecordValueRefused = defineException({
  tag: 'puni/shared-records/RecordValueRefused',
  message: ({ key, problem, form }: { key: string; problem: string; form: string }) =>
    `${key} ${problem}; expected ${form}`,
});

/** A title with no letter or digit, which names no record file: a refused command line. */
export const RecordTitleUnsluggable = defineException({
  tag: 'puni/shared-records/RecordTitleUnsluggable',
  message: ({ title }: { title: string }) =>
    `title ${JSON.stringify(title)} gives an empty file name; it needs at least one letter or digit`,
});

/** A new record whose file already exists; a record is never overwritten: a refused command line. */
export const RecordExists = defineException({
  tag: 'puni/shared-records/RecordExists',
  message: ({ path }: { path: string }) =>
    `${path} already exists in the records repository; a record is never overwritten, so give another title or wait a day`,
});

/** A body file named on the command line that does not exist: a refused command line. */
export const BodyFileMissing = defineException({
  tag: 'puni/shared-records/BodyFileMissing',
  message: ({ path }: { path: string }) => `the body file ${path} does not exist`,
});

/** A draft's body does not satisfy the schema for its kind. */
export const RecordBodyRefused = defineException({
  tag: 'puni/shared-records/RecordBodyRefused',
  message: ({ problem }: { problem: string }) => `body ${problem}`,
});

/** A missing, unreadable or malformed assessment criteria map. */
export const ReviewTemplateFailed = defineException({
  tag: 'puni/shared-records/ReviewTemplateFailed',
  message: ({ reason }: { readonly reason: string }) => reason,
});
