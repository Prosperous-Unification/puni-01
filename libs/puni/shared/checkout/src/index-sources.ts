/**
 * One input of the index that is missing or invalid, named by its repository path. `topic` says
 * which check reports it: `read-first` for a project's `readFirst`, `read-when` for the rest.
 */
export interface SourceDefect {
  readonly topic: 'read-when' | 'read-first';
  readonly path: string;
  readonly message: string;
}

/** What to do about a source defect of each topic: the remedy every reporter of it gives. */
export const sourceDefectRemedies: Readonly<Record<SourceDefect['topic'], string>> = {
  'read-when':
    'give it a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words (a page holds it as front matter with a title)',
  'read-first':
    'set metadata.readFirst to the path, relative to the project, of the file to read first',
};

/** One line of the "Read when" section: a project or an authored page. */
export interface ReadWhenEntry {
  readonly name: string;
  readonly path: string;
  readonly readWhen: string;
}

/** Everything the index is built from, with every defect found while reading it. */
export interface IndexSources {
  readonly entries: readonly ReadWhenEntry[];
  readonly defects: readonly SourceDefect[];
}

/** How the committed `wiki/index/` differs from what would be generated; sorted by path. */
export interface IndexDrift {
  readonly missing: readonly string[];
  readonly stale: readonly string[];
  readonly unexpected: readonly string[];
}
