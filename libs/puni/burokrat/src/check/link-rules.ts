import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { listMarkdownFiles } from '../repository';
import type { Finding, RepositoryReading } from './finding';

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

/**
 * Every relative Markdown link in `AGENTS.md`, `README.md` and `wiki/**` resolves to an existing
 * path. URLs with a scheme, bare fragments and links leaving the repository root are not checked.
 */
export function resolveLinks({ root }: RepositoryReading): Finding[] {
  return listMarkdownFiles(root).flatMap((path) =>
    listLinkTargets(readFileSync(join(root, path), 'utf8'))
      .filter((target) => target !== '' && !/^[A-Za-z][\w+.-]*:/u.test(target))
      .filter((target) => {
        const resolved = posix.normalize(posix.join(posix.dirname(path), target));
        return !resolved.startsWith('../') && resolved !== '..';
      })
      .filter((target) => !existsSync(join(root, posix.dirname(path), target)))
      .map((target) => ({ rule: 'links.resolve', path, message: `links to missing ${target}` })),
  );
}
