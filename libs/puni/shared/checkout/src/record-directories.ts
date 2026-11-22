/**
 * Each record kind and the directory, relative to the records repository root, that holds it. It
 * lives with the checkout because a records checkout writes only inside these directories; the
 * records schema is built on it.
 */
export const recordDirectories = {
  plan: 'nav/plans',
  research: 'nav/research',
  adr: 'bur/adr',
  assessment: 'bur/assessments',
  archive: 'bur/archive',
} as const;

/** A record kind, the `kind` front-matter value. */
export type RecordKind = keyof typeof recordDirectories;

/** The record kinds, in schema order. */
export const recordKinds: readonly RecordKind[] = [
  'plan',
  'research',
  'adr',
  'assessment',
  'archive',
];
