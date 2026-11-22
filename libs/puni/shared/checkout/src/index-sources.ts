/**
 * One input of the index that is missing or invalid, named by its repository path. `topic` says
 * which check reports it: `read-first` for a project's `readFirst`, `read-when` for the rest.
 */
export interface SourceDefect {
  readonly topic: 'read-when' | 'read-first';
  readonly path: string;
  readonly message: string;
}

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
