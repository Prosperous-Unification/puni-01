import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Finding, RepositoryReading } from './finding';
import { findOwner, listScopeMarkdown, repositoryScope } from './scope';

/** Inline link targets outside fenced code blocks, without their `#fragment` or `?query`. */
function listLinkTargets(text: string): string[] {
  let fenced = false;
  return text.split('\n').flatMap((line) => {
    if (/^\s*(```|~~~)/u.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];
    return [...line.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/gu)].map(
      (link) => (link[1] ?? '').split(/[#?]/u)[0] ?? '',
    );
  });
}

/** A link target as a repository path, or `undefined` when it is not checked. */
function resolveTarget(path: string, target: string): string | undefined {
  if (target === '' || /^[A-Za-z][\w+.-]*:/u.test(target)) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(path), target));
  return resolved === '..' || resolved.startsWith('../') ? undefined : resolved;
}

/** Findings for every checked link in `path` whose target `keep` accepts and that is missing. */
function judgeLinks(root: string, path: string, keep: (resolved: string) => boolean): Finding[] {
  return listLinkTargets(readFileSync(join(root, path), 'utf8')).flatMap((target) => {
    const resolved = resolveTarget(path, target);
    if (resolved === undefined || !keep(resolved) || existsSync(join(root, resolved))) return [];
    return [{ rule: 'links.resolve', path, message: `links to missing ${target}` }];
  });
}

/**
 * Every relative Markdown link in a Markdown file git shows resolves to an existing path. URLs
 * with a scheme, bare fragments and links leaving the repository root are not checked.
 *
 * In a project scope a link is judged where its existence is cached correctly: a link whose
 * target the same project owns, by that project; a link into another project, by the root
 * project, whose check reads every file.
 */
export function resolveLinks({ root, scope }: RepositoryReading): Finding[] {
  const failure = (message: string): Finding[] => [{ rule: 'links.resolve', path: '.', message }];
  const own = listScopeMarkdown(root, scope);
  if ('failure' in own) return failure(own.failure);
  if (scope.kind === 'repository')
    return own.files.flatMap((path) => judgeLinks(root, path, () => true));
  const { projects, project } = scope;
  const sameOwner = (path: string) => (resolved: string) =>
    findOwner(projects, resolved) === findOwner(projects, path);
  const findings = own.files.flatMap((path) => judgeLinks(root, path, sameOwner(path)));
  if (project.directory !== '.') return findings;
  const every = listScopeMarkdown(root, repositoryScope);
  if ('failure' in every) return failure(every.failure);
  return [
    ...findings,
    ...every.files.flatMap((path) => {
      const same = sameOwner(path);
      return judgeLinks(root, path, (resolved) => !same(resolved));
    }),
  ];
}

/** Every relative Markdown link in `AGENTS.md` resolves, for a records repository. */
export function resolveAgentsLinks({ root }: RepositoryReading): Finding[] {
  return existsSync(join(root, 'AGENTS.md')) ? judgeLinks(root, 'AGENTS.md', () => true) : [];
}
