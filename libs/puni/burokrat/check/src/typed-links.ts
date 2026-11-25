import type { MarkdownLink } from '@puni/shared-checkout';
import type { RuleReading } from './finding';
import { resolveTarget } from './links';

/**
 * A fragment naming a place rather than a symbol: a GitHub line anchor (`L10`, `L10C5`,
 * `L10-L20`, `L10-20`) or a text fragment (`:~:text=…`).
 */
const placeFragment = /^(?:L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?|:~:.*)$/u;

/**
 * A link that is a typed reference: to the file `resolved`, which a source reader reads at the
 * repository's pin, with a fragment naming a symbol.
 */
export interface TypedLink {
  readonly resolved: string;
  readonly fragment: string;
  readonly written: string;
}

/** A link's destination split: its target, `?query` dropped, and its fragment, if any. */
export function splitDestination(destination: string): {
  readonly target: string;
  readonly fragment: string | undefined;
} {
  const hash = destination.indexOf('#');
  const beforeHash = hash === -1 ? destination : destination.slice(0, hash);
  return {
    target: beforeHash.split('?')[0] ?? '',
    fragment: hash === -1 ? undefined : destination.slice(hash + 1),
  };
}

/**
 * The {@link TypedLink} `link` in the file at `path` is, or `undefined`: a link with no
 * fragment, an empty one or one naming a place (see `placeFragment`), a URL, one leaving the
 * root, or one to a missing file or a file no reader reads at the pin: a Markdown page, whose
 * fragment is a heading, or an HTML page, whose fragment is a web anchor.
 */
export function readTypedLink(
  { files, sources, registry }: RuleReading,
  path: string,
  link: MarkdownLink,
): TypedLink | undefined {
  const { target, fragment } = splitDestination(link.destination);
  if (target === '' || fragment === undefined || fragment === '') return undefined;
  if (placeFragment.test(fragment)) return undefined;
  const resolved = resolveTarget(path, target);
  if (resolved === undefined) return undefined;
  if (files.describe(resolved) !== 'file' || !files.isShown(resolved)) return undefined;
  if (sources.readerOf(resolved, registry.rules) === undefined) return undefined;
  return { resolved, fragment, written: `${target}#${fragment}` };
}
