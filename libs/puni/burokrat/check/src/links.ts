import { posix } from 'node:path';

/** Inline link targets outside fenced code blocks, without their `#fragment` or `?query`. */
export function listLinkTargets(text: string): string[] {
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

/**
 * A link target in the file at `path` as a repository path, or `undefined` when it is not
 * checked: empty, a URL with a scheme, or leaving the repository root.
 */
export function resolveTarget(path: string, target: string): string | undefined {
  if (target === '' || /^[A-Za-z][\w+.-]*:/u.test(target)) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(path), target));
  return resolved === '..' || resolved.startsWith('../') ? undefined : resolved;
}
