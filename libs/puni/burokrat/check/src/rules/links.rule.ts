import type { CheckoutFiles } from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import {
  type LinkTarget,
  listAnchors,
  listLinkTargets,
  listReadAnchors,
  listReadLinkTargets,
  resolveTarget,
} from '../links';

/** How a links rule reads a Markdown file: its links, and the anchors of its headings. */
interface LinkReading {
  readonly links: (text: string) => LinkTarget[];
  readonly anchors: (text: string) => ReadonlySet<string>;
}

/** The links rules of epochs 1 and 2, and those of epoch 3 on, by the shared Markdown reader. */
const readEarlier: LinkReading = { links: listLinkTargets, anchors: listAnchors };
const readShared: LinkReading = { links: listReadLinkTargets, anchors: listReadAnchors };

const remedy = 'point the link at a path that exists, or remove it';

/**
 * Why `fragment` names no heading of the existing file at `path`, or `undefined` when it does or
 * is not judged: only a non-empty fragment of a regular Markdown file is matched against the
 * anchors GitHub gives its headings.
 */
export function findMissingAnchor(
  files: CheckoutFiles,
  path: string,
  fragment: string | undefined,
  readAnchors: (text: string) => ReadonlySet<string> = listAnchors,
): string | undefined {
  if (fragment === undefined || fragment === '' || !path.endsWith('.md')) return undefined;
  if (files.describe(path) !== 'file') return undefined;
  const anchors = readAnchors(files.readText(path));
  return anchors.has(fragment) ? undefined : `${path} has no heading with the anchor #${fragment}`;
}

/** Breaches for every checked link in `path` whose target `keep` accepts and is missing. */
function judgeLinks(
  files: CheckoutFiles,
  path: string,
  keep: (resolved: string) => boolean,
  read: LinkReading,
): Breach[] {
  return read.links(files.readText(path)).flatMap(({ target, fragment }): Breach[] => {
    const resolved = target === '' ? path : resolveTarget(path, target);
    if (resolved === undefined || !keep(resolved)) return [];
    if (!files.isShown(resolved)) return [{ path, message: `links to missing ${target}` }];
    const missing = findMissingAnchor(files, resolved, fragment, read.anchors);
    const anchor = `#${fragment ?? ''}`;
    return missing === undefined
      ? []
      : [
          {
            path,
            message: `links to ${target}${anchor}, but ${missing}`,
            remedy: `point the link at a heading of ${resolved}, or drop the ${anchor}`,
          },
        ];
  });
}

/** The breaches of the links of the `.md` files the scope owns, read by `read`. */
function judgeScopeLinks({ files, scope, references }: RuleReading, read: LinkReading): Breach[] {
  return files
    .listVisible(scope)
    .filter((path) => path.endsWith('.md'))
    .flatMap((path) =>
      judgeLinks(files, path, (resolved) => reachesReference(references, path, resolved), read),
    );
}

/**
 * Every relative Markdown link in a visible Markdown file the scope owns resolves to an existing
 * path, and its `#fragment`, if the target is Markdown, to one of its headings, among the links
 * the run's reach judges; a bare `#fragment` names a heading of its own file. URLs with a scheme
 * and links leaving the repository root are not checked. Epochs 1 and 2, an inline link outside
 * a fenced block; {@link resolveReadLinks} reads links as the other docs rules do.
 */
export const resolveLinks: Rule = {
  id: 'links.resolve',
  since: 1,
  until: 3,
  remedy,
  judge: (reading) => judgeScopeLinks(reading, readEarlier),
};

/**
 * {@link resolveLinks} over the links `readMarkdown` reads, inline and by reference, outside
 * fenced and indented code, front matter and HTML comments read as prose, a heading's anchor
 * none of a code block.
 */
export const resolveReadLinks: Rule = {
  id: 'links.resolve',
  since: 3,
  remedy,
  judge: (reading) => judgeScopeLinks(reading, readShared),
};

/**
 * Every relative Markdown link in `AGENTS.md` resolves, for a records repository, its links read
 * as epochs 1 and 2 read them at every pin.
 */
export const resolveAgentsLinks: Rule = {
  id: 'links.resolve',
  since: 1,
  remedy,
  judge: ({ files }) =>
    files.exists('AGENTS.md') ? judgeLinks(files, 'AGENTS.md', () => true, readEarlier) : [],
};
