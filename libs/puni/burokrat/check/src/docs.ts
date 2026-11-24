import { posix } from 'node:path';
import { leavesRoot } from '@puni/shared-checkout';

/**
 * Whether the file at `path` is documentation the docs rules judge: `AGENTS.md`, `README.md`, or
 * Markdown under `wiki/`.
 */
export function isDocumentation(path: string): boolean {
  if (path === 'AGENTS.md' || path === 'README.md') return true;
  return path.startsWith('wiki/') && path.endsWith('.md');
}

/** The Markdown of `text` split into the lines of fenced code blocks and the prose between them. */
export function splitFences(text: string): { readonly prose: string[]; readonly fenced: string[] } {
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

/** A repository path an inline code span names, and the heading anchor after its `#`, if any. */
export interface PathReference {
  readonly path: string;
  readonly fragment: string | undefined;
}

/**
 * The {@link PathReference} of an inline code span: the part before a `#` read by
 * {@link readPathToken}, and the rest as the fragment.
 */
export function readPathReference(span: string): PathReference | undefined {
  const hash = span.indexOf('#');
  const path = readPathToken(hash === -1 ? span : span.slice(0, hash));
  if (path === undefined) return undefined;
  return { path, fragment: hash === -1 ? undefined : span.slice(hash + 1) };
}

/**
 * Whether `word` reads as a code symbol rather than prose: a camelCase or compound PascalCase
 * name (`renderRootMap`, `CommandExitCode`) or an upper-case name with an underscore
 * (`PUNI_FAILURE_REPORT`). A single capitalised or lower-case word is prose.
 */
export function isSymbolName(word: string): boolean {
  return (
    /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/u.test(word) ||
    /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/u.test(word) ||
    /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/u.test(word)
  );
}

/** The extension that makes a dotted span a file name (`render-map.ts`, `puni.json`). */
const fileExtension = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|toml|sh|txt|lock)$/u;

/**
 * The code symbol an inline code span names, or `undefined` when it reads as anything else: the
 * span is one name or a dotted chain of names, `()` after it allowed (`listCommands()`,
 * `CheckRules.sets`), whose first name reads as a symbol by {@link isSymbolName} and whose last is no
 * file extension. So a key path (`metadata.readWhen`), a member of a runtime object
 * (`process.exitCode`), a file name, a path, a command, a flag and a single word are not.
 */
export function readSymbolSpan(span: string): string | undefined {
  const chain = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:\(\))?$/u.exec(span)?.[1];
  if (chain === undefined || fileExtension.test(chain)) return undefined;
  return isSymbolName(chain.split('.')[0] ?? '') ? chain : undefined;
}

/**
 * The inline code spans of the Markdown `text` that are not the text of a link: those outside
 * fenced code blocks, once every inline link is dropped from its line.
 */
export function listUnlinkedCode(text: string): string[] {
  return splitFences(text).prose.flatMap((line) =>
    [...line.replace(/\[[^\]]*\]\([^)]*\)/gu, '').matchAll(/`([^`]+)`/gu)].map(
      (span) => span[1] ?? '',
    ),
  );
}
