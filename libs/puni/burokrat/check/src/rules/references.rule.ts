import { posix } from 'node:path';
import { repositoryScope } from '@puni/shared-checkout';
import { isDocumentation } from '../docs';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { resolveTarget } from '../links';
import { isMarkdown, type MarkdownLink, readProse } from '../markdown';
import { listCommentedFiles } from './docs.rule';

/** A GitHub line anchor, `L10` or `L10-L20`: a place in a file, not a symbol. */
const lineAnchor = /^L\d+(?:-L\d+)?$/u;

/**
 * A link that is a typed reference: from the file at `path` to the file `resolved`, which a
 * source reader reads at the repository's pin, with a fragment that is no line anchor.
 */
interface TypedLink {
  readonly resolved: string;
  readonly fragment: string;
  readonly written: string;
}

/**
 * The {@link TypedLink} `link` in the file at `path` is, or `undefined`: a link with no
 * fragment, an empty one or a line anchor, a URL, one leaving the root, or one to a missing
 * file (which `links.resolve` judges) or a file no reader reads at the pin: a Markdown page,
 * whose fragment is a heading, or an HTML page, whose fragment is a web anchor.
 */
function readTypedLink(
  { files, sources, registry }: RuleReading,
  path: string,
  link: MarkdownLink,
): TypedLink | undefined {
  const hash = link.destination.indexOf('#');
  if (hash === -1) return undefined;
  const target = link.destination.slice(0, hash).split('?')[0] ?? '';
  const fragment = link.destination.slice(hash + 1);
  if (target === '' || fragment === '' || lineAnchor.test(fragment)) return undefined;
  const resolved = resolveTarget(path, target);
  if (resolved === undefined) return undefined;
  if (files.describe(resolved) !== 'file' || !files.isShown(resolved)) return undefined;
  if (sources.readerOf(resolved, registry.rules) === undefined) return undefined;
  return { resolved, fragment, written: `${target}#${fragment}` };
}

/**
 * The file a re-export of `specifier` from the file at `from` names, among the shown files a
 * source reader reads at the pin: the path itself, with its extension replaced by or followed
 * by each such extension, or its `index` file. A bare package name names none here.
 */
function resolveModule(reading: RuleReading, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const stem = base.slice(0, base.length - posix.extname(base).length);
  const extensions = reading.sources.extensions(reading.registry.rules);
  const candidates = [
    base,
    ...extensions.map((extension) => `${stem}${extension}`),
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find(
    (candidate) =>
      reading.files.describe(candidate) === 'file' &&
      reading.files.isShown(candidate) &&
      reading.sources.readerOf(candidate, reading.registry.rules) !== undefined,
  );
}

/**
 * The names the file at `path` declares, and those of each module it re-exports whole, one hop
 * (`export *` passes on no `default`), with the re-exports no file resolves to.
 */
function readDeclared(
  reading: RuleReading,
  path: string,
): { readonly names: ReadonlySet<string>; readonly unfollowed: readonly string[] } {
  const reader = reading.sources.readerOf(path, reading.registry.rules);
  if (reader === undefined) return { names: new Set(), unfollowed: [] };
  const text = reading.files.readText(path);
  const names = new Set(reader.declarations(text).map(({ name }) => name));
  const unfollowed: string[] = [];
  for (const specifier of reader.reexports(text)) {
    const module = resolveModule(reading, path, specifier);
    const moduleReader =
      module === undefined ? undefined : reading.sources.readerOf(module, reading.registry.rules);
    if (module === undefined || moduleReader === undefined) {
      unfollowed.push(specifier);
      continue;
    }
    for (const { name } of moduleReader.declarations(reading.files.readText(module))) {
      if (name !== 'default' && !name.startsWith('default.')) names.add(name);
    }
  }
  return { names, unfollowed };
}

/**
 * Every link of a Markdown file the scope owns (see `isMarkdown`) that is a typed reference
 * (see `readTypedLink`) names in its fragment a symbol the file declares, as the source reader
 * of its extension reads it at the repository's pin (`render-map.ts#renderRootMap`,
 * `contract.ts#SourceReader.since`), or a module it re-exports whole declares; so the link goes
 * stale loudly when the code renames or removes the symbol. Links are judged among those the
 * run's reach judges.
 */
export const judgeDocReferences: Rule = {
  id: 'docs.references',
  since: 3,
  remedy: 'point the #fragment at a symbol the file declares, as Name or Name.member',
  judge(reading) {
    const { files, scope, references } = reading;
    return files
      .listVisible(scope)
      .filter(isMarkdown)
      .flatMap((path) =>
        readProse(files.readText(path)).links.flatMap((link): Breach[] => {
          const typed = readTypedLink(reading, path, link);
          if (typed === undefined || !reachesReference(references, path, typed.resolved)) {
            return [];
          }
          const { names, unfollowed } = readDeclared(reading, typed.resolved);
          if (names.has(typed.fragment)) return [];
          const passed =
            unfollowed.length === 0
              ? ''
              : `; it re-exports ${unfollowed.join(', ')}, which this check does not follow`;
          return [
            {
              path,
              message: `links to ${typed.written}, but ${typed.resolved} declares no ${typed.fragment}${passed}`,
            },
          ];
        }),
      );
  },
};

/** The first file exporting each name, of every shown file a source reader reads at the pin. */
function indexDeclarations(reading: RuleReading): ReadonlyMap<string, string> {
  const declaring = new Map<string, string>();
  for (const path of reading.files.listVisible(repositoryScope)) {
    const reader = reading.sources.readerOf(path, reading.registry.rules);
    if (reader === undefined) continue;
    for (const { name, exported } of reader.declarations(reading.files.readText(path))) {
      if (exported && name !== 'default' && !declaring.has(name)) declaring.set(name, path);
    }
  }
  return declaring;
}

/** `code` as the symbol it may name: without a `()` after it. */
const symbolOf = (code: string): string => code.replace(/\(\)$/u, '');

/**
 * Every inline code span in the documentation the scope owns (see `isDocumentation`) that is a
 * name some source file exports (see `SourceReader.declarations`), `()` after it allowed, is
 * the text of a typed reference to it: `[name](path#name)`, the fragment the same name. And
 * the text of a link that is one code span agrees with a typed reference's fragment, so a link
 * whose symbol was renamed under its text fails too. Any project's source may declare a name,
 * so a project check, whose reach is `within-project`, judges none; the cross-project run and
 * the whole check judge them all.
 */
export const judgeDocSpans: Rule = {
  id: 'docs.spans',
  since: 3,
  remedy:
    'link the symbol to the file that declares it, as [`name`](path#name), its text the fragment',
  judge(reading) {
    const { files, scope, references } = reading;
    if (references.kind === 'within-project') return [];
    const declaring = indexDeclarations(reading);
    return files
      .listVisible(scope)
      .filter(isDocumentation)
      .flatMap((path) => {
        const prose = readProse(files.readText(path));
        const breaches: Breach[] = [];
        for (const { code, inLinkText } of prose.spans) {
          const owner = declaring.get(symbolOf(code));
          if (inLinkText || owner === undefined) continue;
          breaches.push({
            path,
            message: `names the symbol ${symbolOf(code)}, which ${owner} exports, without linking it`,
          });
        }
        for (const link of prose.links) {
          if (link.code === undefined) continue;
          const symbol = symbolOf(link.code);
          const typed = readTypedLink(reading, path, link);
          const owner = declaring.get(symbol);
          if (owner !== undefined && typed?.fragment !== symbol) {
            breaches.push({
              path,
              message: `links the symbol ${symbol}, which ${owner} exports, to ${link.destination}`,
            });
          } else if (owner === undefined && typed !== undefined && typed.fragment !== symbol) {
            breaches.push({
              path,
              message: `links ${symbol} to ${typed.written}, a fragment naming another symbol`,
              remedy: 'make the link text the symbol its fragment names',
            });
          }
        }
        return [...new Map(breaches.map((breach) => [breach.message, breach])).values()];
      });
  },
};

/**
 * Every inline link of a doc comment of the files of `listCommentedFiles` names something
 * visible where the comment stands, as the file's source reader resolves it
 * (`SourceReader.links`), so the link goes stale loudly when the name is renamed or removed.
 */
export const judgeDocLinks: Rule = {
  id: 'docs.comment-links',
  since: 3,
  remedy: 'link a name visible where the comment stands, importing it if need be',
  judge(reading) {
    return listCommentedFiles(reading).flatMap((path) => {
      const reader = reading.sources.readerOf(path, reading.registry.rules);
      if (reader === undefined) return [];
      return reader
        .links(reading.files.readText(path))
        .filter(({ resolves }) => !resolves)
        .map(({ target, line }) => ({
          path,
          message: `line ${String(line)} links ${target}, which names nothing visible there`,
        }));
    });
  },
};
