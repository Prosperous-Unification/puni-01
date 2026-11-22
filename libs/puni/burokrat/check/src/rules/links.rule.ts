import type { CheckoutFiles } from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule } from '../finding';
import { listLinkTargets, resolveTarget } from '../links';

const remedy = 'point the link at a path that exists, or remove it';

/** Breaches for every checked link in `path` whose target `keep` accepts and that is missing. */
function judgeLinks(
  files: CheckoutFiles,
  path: string,
  keep: (resolved: string) => boolean,
): Breach[] {
  return listLinkTargets(files.readText(path)).flatMap((target) => {
    const resolved = resolveTarget(path, target);
    if (resolved === undefined || !keep(resolved) || files.exists(resolved)) return [];
    return [{ path, message: `links to missing ${target}` }];
  });
}

/**
 * Every relative Markdown link in a visible Markdown file the scope owns resolves to an existing
 * path, among the links the run's reach judges. URLs with a scheme, bare fragments and links
 * leaving the repository root are not checked.
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
