import { posix } from 'node:path';
import { leavesRoot, type MarkdownOptions, readMarkdown } from '@puni/shared-checkout';
import { splitFences } from './docs';

/**
 * How the rules epochs 1 and 2 hold read Markdown from epoch 3: front matter and HTML comments
 * as prose, as those epochs read them, so a later pin reads no less.
 */
export const readAsBefore: MarkdownOptions = { frontMatter: 'prose', comments: 'prose' };

/** One inline link: its target path without `?query` (empty for a bare `#fragment`) and fragment. */
export interface LinkTarget {
  readonly target: string;
  readonly fragment: string | undefined;
}

/** A link destination as the {@link LinkTarget} it names. */
function readLinkTarget(raw: string): LinkTarget {
  const hash = raw.indexOf('#');
  const beforeHash = hash === -1 ? raw : raw.slice(0, hash);
  return {
    target: beforeHash.split('?')[0] ?? '',
    fragment: hash === -1 ? undefined : raw.slice(hash + 1),
  };
}

/** The inline links of `text` outside fenced code blocks, as epochs 1 and 2 read them. */
export function listLinkTargets(text: string): LinkTarget[] {
  return splitFences(text).prose.flatMap((line) =>
    [...line.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/gu)].map((link) =>
      readLinkTarget(link[1] ?? ''),
    ),
  );
}

/**
 * The links of `text` as `readMarkdown` reads them with {@link readAsBefore}, from epoch 3:
 * inline and by reference, outside fenced and indented code.
 */
export function listReadLinkTargets(text: string): LinkTarget[] {
  return readMarkdown(text, readAsBefore).links.map(({ destination }) =>
    readLinkTarget(destination),
  );
}

/**
 * A link target in the file at `path` as a repository path, or `undefined` when it is not
 * checked: empty, a URL with a scheme, or leaving the repository root.
 */
export function resolveTarget(path: string, target: string): string | undefined {
  if (target === '' || /^[A-Za-z][\w+.-]*:/u.test(target)) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(path), target));
  return leavesRoot(resolved) ? undefined : resolved;
}

/**
 * The anchor GitHub gives the heading text `heading`: links reduced to their text, lower-cased,
 * every character but a letter, mark, digit, connector, hyphen or space dropped, each space a
 * hyphen.
 */
export function slugHeading(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replaceAll(' ', '-');
}

/** The anchors GitHub gives the ATX headings among `lines`, a repeated one suffixed `-1`, `-2`… */
function anchorHeadings(lines: readonly string[]): ReadonlySet<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of lines) {
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/u.exec(line)?.[1];
    if (heading === undefined) continue;
    const slug = slugHeading(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${String(count)}`);
  }
  return anchors;
}

/**
 * The anchors of the ATX headings of the Markdown `text` outside fenced code blocks, as GitHub
 * makes them (see {@link slugHeading}), as epochs 1 and 2 read them.
 */
export function listAnchors(text: string): ReadonlySet<string> {
  return anchorHeadings(splitFences(text).prose);
}

/**
 * The anchors of the ATX headings of `text` outside the code blocks `readMarkdown` reads with
 * {@link readAsBefore}, fenced and indented, from epoch 3.
 */
export function listReadAnchors(text: string): ReadonlySet<string> {
  const code = new Set(readMarkdown(text, readAsBefore).codeLines.map(({ line }) => line));
  return anchorHeadings(text.split('\n').filter((_, at) => !code.has(at + 1)));
}
