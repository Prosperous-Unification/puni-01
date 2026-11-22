import { posix } from 'node:path';
import { indexDirectory, leavesRoot } from '@puni/shared-checkout';

/**
 * Whether the file at `path` is documentation the docs rules judge: `AGENTS.md`, `README.md`, or
 * Markdown under `wiki/` outside the generated `wiki/index/`.
 */
export function isDocumentation(path: string): boolean {
  if (path === 'AGENTS.md' || path === 'README.md') return true;
  return path.startsWith('wiki/') && path.endsWith('.md') && !path.startsWith(`${indexDirectory}/`);
}

/** The Markdown of `text` split into fenced code blocks and the prose between them. */
function splitFences(text: string): { readonly prose: string[]; readonly fenced: string[] } {
  const prose: string[] = [];
  const fenced: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    (inFence ? fenced : prose).push(line);
  }
  return { prose, fenced };
}

/** The inline code spans of `text` outside fenced code blocks, each on one line. */
export function listInlineCode(text: string): string[] {
  return splitFences(text).prose.flatMap((line) =>
    [...line.matchAll(/`([^`]+)`/gu)].map((span) => span[1] ?? ''),
  );
}

/** Every piece of code in `text`: inline code spans, and each line of a fenced block. */
export function listCode(text: string): string[] {
  return [...listInlineCode(text), ...splitFences(text).fenced];
}

/**
 * The repository path an inline code span names, or `undefined` when it does not look like one:
 * it holds a `/` and either ends in one or its last segment has an extension; it has no space,
 * no glob or placeholder character, no URL scheme, and does not start with `..`, `/`, `~` or a
 * `-`. A leading `./` and a trailing `/` are dropped.
 */
export function readPathToken(span: string): string | undefined {
  if (!span.includes('/') || /[\s*?[\]{}<>$]/u.test(span)) return undefined;
  if (/^(\.\.|\/|~|-)/u.test(span) || /^[A-Za-z][\w+.-]*:/u.test(span)) return undefined;
  const isDirectory = span.endsWith('/');
  if (!isDirectory && !/\.[A-Za-z0-9]+$/u.test(posix.basename(span))) return undefined;
  const normal = posix.normalize(span).replace(/\/$/u, '');
  return normal === '.' || leavesRoot(normal) ? undefined : normal;
}
