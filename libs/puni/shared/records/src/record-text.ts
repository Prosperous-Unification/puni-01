import type { RecordKind } from '@puni/shared-checkout';

/**
 * The file-name slug of a record titled `title`: lower-cased, every run of anything but ASCII
 * letters and digits turned into one hyphen, hyphens trimmed from both ends. A title with no
 * such letter or digit gives the empty slug.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** The front matter of a new record, in the order the records schema lists its keys. */
export interface RecordFields {
  readonly kind: RecordKind;
  readonly title: string;
  readonly date: string;
  readonly commit: string;
  readonly topics: string;
  readonly summary: string;
}

/** The keys of {@link RecordFields} in the order a record writes and judges them. */
export const fieldOrder = ['kind', 'title', 'date', 'commit', 'topics', 'summary'] as const;

/** The text of a record: its front matter between `---` lines, a blank line, then `body`. */
export function formatRecord(fields: RecordFields, body: string): string {
  const lines = fieldOrder.map((key) => `${key}: ${fields[key]}`);
  const ending = body.endsWith('\n') ? '' : '\n';
  return ['---', ...lines, '---', '', `${body}${ending}`].join('\n');
}
