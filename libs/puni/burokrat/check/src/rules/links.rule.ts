import type { CheckoutFiles } from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule } from '../finding';
import { listAnchors, listLinkTargets, resolveTarget } from '../links';

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
): string | undefined {
  if (fragment === undefined || fragment === '' || !path.endsWith('.md')) return undefined;
  if (files.describe(path) !== 'file') return undefined;
  const anchors = listAnchors(files.readText(path));
  return anchors.has(fragment) ? undefined : `${path} has no heading with the anchor #${fragment}`;
}

/** Breaches for every checked link in `path` whose target `keep` accepts and is missing. */
function judgeLinks(
  files: CheckoutFiles,
  path: string,
  keep: (resolved: string) => boolean,
): Breach[] {
  return listLinkTargets(files.readText(path)).flatMap(({ target, fragment }): Breach[] => {
    const resolved = target === '' ? path : resolveTarget(path, target);
    if (resolved === undefined || !keep(resolved)) return [];
    if (!files.isShown(resolved)) return [{ path, message: `links to missing ${target}` }];
    const missing = findMissingAnchor(files, resolved, fragment);
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

/**
 * Every relative Markdown link in a visible Markdown file the scope owns resolves to an existing
 * path, and its `#fragment`, if the target is Markdown, to one of its headings, among the links
 * the run's reach judges; a bare `#fragment` names a heading of its own file. URLs with a scheme
 * and links leaving the repository root are not checked.
 */
export const resolveLinks: Rule = {
  id: 'links.resolve',
  remedy,
  judge({ files, scope, references }) {
    return files
      .listVisible(scope)
      .filter((path) => path.endsWith('.md'))
      .flatMap((path) =>
        judgeLinks(files, path, (resolved) => reachesReference(references, path, resolved)),
      );
  },
};

/** Every relative Markdown link in `AGENTS.md` resolves, for a records repository. */
export const resolveAgentsLinks: Rule = {
  id: 'links.resolve',
  remedy,
  judge: ({ files }) =>
    files.exists('AGENTS.md') ? judgeLinks(files, 'AGENTS.md', () => true) : [],
};
