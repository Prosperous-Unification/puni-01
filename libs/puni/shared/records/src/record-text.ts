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
  /** The path of the record this one replaces, written after `summary`. */
  readonly supersedes?: string | undefined;
}

/** The keys of {@link RecordFields} in the order a record writes and judges them. */
export const fieldOrder = ['kind', 'title', 'date', 'commit', 'topics', 'summary'] as const;

/** The text of a record: its front matter between `---` lines, a blank line, then `body`. */
export function formatRecord(fields: RecordFields, body: string): string {
  const lines = fieldOrder.map((key) => `${key}: ${fields[key]}`);
  if (fields.supersedes !== undefined) lines.push(`supersedes: ${fields.supersedes}`);
  const ending = body.endsWith('\n') ? '' : '\n';
  return ['---', ...lines, '---', '', `${body}${ending}`].join('\n');
}

/**
 * `text`, a record whose front matter parses, with `superseded-by: <path>` as the last line of its
 * front matter; every other byte is kept.
 */
export function addSupersededBy(text: string, path: string): string {
  const lines = text.split(/(?<=\n)/u);
  const end = lines.findIndex((line, index) => index > 0 && line.replace(/\r?\n$/u, '') === '---');
  const ending = /\r\n$/u.test(lines[0] ?? '') ? '\r\n' : '\n';
  return [...lines.slice(0, end), `superseded-by: ${path}${ending}`, ...lines.slice(end)].join('');
}
