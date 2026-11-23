import { wikiSections } from './wiki-sections';

/**
 * One input of the index that is missing or invalid, named by its repository path. `topic` says
 * which check reports it: `read-first` for a project's `readFirst`, `scope` for its scope tag,
 * `section` for a page outside the wiki root and its sections, `read-when` for the rest.
 */
export interface SourceDefect {
  readonly topic: 'read-when' | 'read-first' | 'scope' | 'section';
  readonly path: string;
  readonly message: string;
}

/** What to do about a source defect of each topic: the remedy every reporter of it gives. */
export const sourceDefectRemedies: Readonly<Record<SourceDefect['topic'], string>> = {
  'read-when':
    'give it a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words (a page holds it as front matter with a title)',
  'read-first':
    'set metadata.readFirst to the path, relative to the project, of the file to read first',
  scope:
    'give the project exactly one tag scope:<name>, <name> lower-case letters, digits and hyphens and not index: the index partition that lists it',
  section: `move the page to wiki/ or to the section its content is: ${wikiSections
    .map(({ directory, purpose }) => `wiki/${directory}/ for ${purpose}`)
    .join('; ')}`,
};

/**
 * One line of a "Read when" section: an authored page, listed in the index file, or a project,
 * listed in the partition of its `scope`, the `<name>` of its `scope:<name>` tag.
 */
export interface ReadWhenEntry {
  readonly name: string;
  readonly path: string;
  readonly readWhen: string;
  readonly scope?: string;
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
