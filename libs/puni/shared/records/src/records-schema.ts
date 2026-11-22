import { recordDirectories, recordKinds } from '@puni/shared-checkout';

export { type RecordKind, recordDirectories, recordKinds } from '@puni/shared-checkout';

/**
 * The top level of a records repository: each allowed name and whether it is a directory.
 * `dash/` holds anything and is not inspected; `nav/` and `bur/` hold only kind directories.
 */
export const recordsTopLevel: Readonly<Record<string, 'file' | 'directory'>> = {
  '.github': 'directory',
  '.gitignore': 'file',
  'AGENTS.md': 'file',
  'CLAUDE.md': 'file',
  bur: 'directory',
  dash: 'directory',
  nav: 'directory',
  'puni.json': 'file',
};

/** The most entries a record's `topics` may hold. */
export const recordTopicLimit = 5;

/** The most whitespace-separated words a record's `summary` may hold. */
export const recordSummaryWordBudget = 30;

/** Lower-case letters and digits separated by single hyphens: record slugs and topics. */
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A record file name: `YYYY-MM-DD-<slug>.md`. */
export const recordNamePattern = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;

/** The front-matter keys every record holds, each with the form a finding states. */
export const requiredRecordKeys = {
  kind: `one of ${recordKinds.join(', ')}, matching its directory (${recordKinds
    .map((kind) => `${recordDirectories[kind]} → ${kind}`)
    .join(', ')})`,
  title: 'non-empty text on one line',
  date: 'the YYYY-MM-DD date in the file name',
  commit: 'the code repository commit it was written against: 7 to 40 lower-case hex characters',
  topics: `1 to ${String(recordTopicLimit)} comma-separated topics, each lower-case letters and digits joined by single hyphens, no duplicates`,
  summary: `non-empty text on one line, at most ${String(recordSummaryWordBudget)} words`,
} as const;

/** The front-matter keys a record may hold, each with its form. */
export const optionalRecordKeys = {
  supersedes: 'the repository-relative path of the record this one replaces',
  'superseded-by': 'the repository-relative path of the record that replaces this one',
} as const;
