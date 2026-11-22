import { type CheckoutFiles, findOwner, repositoryScope } from '@puni/shared-checkout';
import type { Finding, RuleReading } from '../finding';
import { listLinkTargets, resolveTarget } from '../links';

/** Findings for every checked link in `path` whose target `keep` accepts and that is missing. */
function judgeLinks(
  files: CheckoutFiles,
  path: string,
  keep: (resolved: string) => boolean,
): Finding[] {
  return listLinkTargets(files.readText(path)).flatMap((target) => {
    const resolved = resolveTarget(path, target);
    if (resolved === undefined || !keep(resolved) || files.exists(resolved)) return [];
    return [{ rule: 'links.resolve', path, message: `links to missing ${target}` }];
  });
}

function listMarkdown(files: CheckoutFiles, scope: RuleReading['scope']) {
  const listing = files.listVisible(scope);
  if ('failure' in listing) return listing;
  return { files: listing.files.filter((path) => path.endsWith('.md')) };
}

/**
 * Every relative Markdown link in a visible Markdown file resolves to an existing path. URLs with
 * a scheme, bare fragments and links leaving the repository root are not checked.
 *
 * In a project scope a link is judged where its existence is cached correctly: a link whose
 * target the same project owns, by that project; a link into another project, by the root
 * project, whose check reads every file.
 */
export function resolveLinks({ files, scope }: RuleReading): Finding[] {
  const failure = (message: string): Finding[] => [{ rule: 'links.resolve', path: '.', message }];
  const own = listMarkdown(files, scope);
  if ('failure' in own) return failure(own.failure);
  if (scope.kind === 'repository')
    return own.files.flatMap((path) => judgeLinks(files, path, () => true));
  const { projects, project } = scope;
  const sameOwner = (path: string) => (resolved: string) =>
    findOwner(projects, resolved) === findOwner(projects, path);
  const findings = own.files.flatMap((path) => judgeLinks(files, path, sameOwner(path)));
  if (project.directory !== '.') return findings;
  const every = listMarkdown(files, repositoryScope);
  if ('failure' in every) return failure(every.failure);
  return [
    ...findings,
    ...every.files.flatMap((path) => {
      const same = sameOwner(path);
      return judgeLinks(files, path, (resolved) => !same(resolved));
    }),
  ];
}

/** Every relative Markdown link in `AGENTS.md` resolves, for a records repository. */
export function resolveAgentsLinks({ files }: RuleReading): Finding[] {
  return files.exists('AGENTS.md') ? judgeLinks(files, 'AGENTS.md', () => true) : [];
}
