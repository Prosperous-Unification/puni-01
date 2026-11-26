import { posix } from 'node:path';

/**
 * A kind of authored wiki page: the directory below `wiki/` that holds its pages, the heading its
 * pages are listed under in the map, and what a page of it is for.
 */
export interface WikiSection {
  readonly directory: string;
  readonly heading: string;
  readonly purpose: string;
}

/**
 * The sections an authored page may live in, in the order the map lists them. A page directly
 * in `wiki/` belongs to none: it is listed first, under the map's own "Read when".
 */
export const wikiSections: readonly WikiSection[] = [
  {
    directory: 'concepts',
    heading: 'Concepts',
    purpose: 'what the whole repository obeys and why, where no check, type or JSDoc can say it',
  },
  {
    directory: 'how-to',
    heading: 'How to',
    purpose: 'a task that spans the repository, as ordered steps',
  },
];

/**
 * Where the authored page at `path` (Markdown under `wiki/`) sits: at the
 * wiki root, in one of the {@link wikiSections}, or in a directory that is none of them.
 */
export function placePage(
  path: string,
):
  | { readonly kind: 'root' }
  | { readonly kind: 'section'; readonly section: WikiSection }
  | { readonly kind: 'unplaced'; readonly directory: string } {
  const directory = posix.dirname(posix.relative('wiki', path));
  if (directory === '.') return { kind: 'root' };
  const section = wikiSections.find((candidate) => candidate.directory === directory);
  return section === undefined ? { kind: 'unplaced', directory } : { kind: 'section', section };
}
