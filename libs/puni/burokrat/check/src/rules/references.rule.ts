import { posix } from 'node:path';
import {
  isMarkdown,
  type MarkdownLink,
  readMarkdown,
  repositoryScope,
} from '@puni/shared-checkout';
import { type DocSelection, isTypedDocumentation, selectsDocumentation } from '../docs';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { isGeneratedFile, readAttributes } from '../generated-files';
import { resolveTarget } from '../links';
import { readSourceFile } from '../source-files';
import { listCommentedFiles } from './docs.rule';

/**
 * A fragment naming a place rather than a symbol: a GitHub line anchor (`L10`, `L10C5`,
 * `L10-L20`, `L10-20`) or a text fragment (`:~:text=…`).
 */
const placeFragment = /^(?:L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?|:~:.*)$/u;

/**
 * A link that is a typed reference: to the file `resolved`, which a source reader reads at the
 * repository's pin, with a fragment naming a symbol.
 */
interface TypedLink {
  readonly resolved: string;
  readonly fragment: string;
  readonly written: string;
}

/** A link's destination split: its target, `?query` dropped, and its fragment, if any. */
function splitDestination(destination: string): {
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
function readTypedLink(
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
 * The names the file at `path` declares, and those of every module it re-exports whole, hop
 * after hop (`export *` passes on no `default`), with the re-exports no file resolves to.
 */
function readDeclared(
  reading: RuleReading,
  path: string,
): { readonly names: ReadonlySet<string>; readonly unfollowed: readonly string[] } {
  const names = new Set<string>();
  const unfollowed: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string, hop: number): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const read = readSourceFile(reading, file);
    if (read === undefined) return;
    for (const { name } of read.declarations) {
      if (hop === 0 || (name !== 'default' && !name.startsWith('default.'))) names.add(name);
    }
    for (const specifier of read.reexports) {
      const module = resolveModule(reading, file, specifier);
      if (module === undefined) unfollowed.push(specifier);
      else visit(module, hop + 1);
    }
  };
  visit(path, 0);
  return { names, unfollowed };
}

/** The breaches of the links of the Markdown files `isJudged` chooses (see {@link judgeDocReferences}). */
function judgeReferences(reading: RuleReading, isJudged: (path: string) => boolean): Breach[] {
  const { files, scope, references } = reading;
  return files
    .listVisible(scope)
    .filter(isJudged)
    .flatMap((path) =>
      readMarkdown(files.readText(path), true).links.flatMap((link): Breach[] => {
        const { target } = splitDestination(link.destination);
        const resolved = target === '' ? undefined : resolveTarget(path, target);
        if (resolved === undefined || !reachesReference(references, path, resolved)) return [];
        if (!path.endsWith('.md') && !files.isShown(resolved)) {
          return [
            {
              path,
              message: `line ${String(link.line)} links to missing ${target}`,
              remedy: 'point the link at a path that exists, or remove it',
            },
          ];
        }
        const typed = readTypedLink(reading, path, link);
        if (typed === undefined) return [];
        const { names, unfollowed } = readDeclared(reading, typed.resolved);
        if (names.has(typed.fragment)) return [];
        const passed =
          unfollowed.length === 0
            ? ''
            : `; it re-exports ${unfollowed.join(', ')}, which this check does not follow`;
        return [
          {
            path,
            message: `line ${String(link.line)} links to ${typed.written}, but ${typed.resolved} declares no ${typed.fragment}${passed}`,
          },
        ];
      }),
    );
}

const referencesRemedy =
  'point the #fragment at a symbol the file declares, as Name or Name.member';

/**
 * Every link of a Markdown file the scope owns (see `isMarkdown`) that is a typed reference
 * (see `readTypedLink`) names in its fragment a symbol the file declares, as the source reader
 * of its extension reads it at the repository's pin (`render-map.ts#renderRootMap`,
 * `contract.ts#SourceReader.since`), or a module it re-exports whole, at any remove, declares;
 * so the link goes stale loudly when the code renames or removes the symbol. A member a class or
 * interface inherits from a base the same file declares is one of its own; one inherited from
 * another file's is not. In a Markdown file `links.resolve` does not read (`.markdown`, `.mdx`,
 * an upper-case `.MD`), a relative link to a missing path is refused too. Links are judged among
 * those the run's reach judges. Epoch 3, over every Markdown file; {@link judgeTypedDocReferences}
 * judges the documentation by its declared type.
 */
export const judgeDocReferences: Rule = {
  id: 'docs.references',
  since: 3,
  until: 4,
  remedy: referencesRemedy,
  judge: (reading) => judgeReferences(reading, isMarkdown),
};

/**
 * {@link judgeDocReferences} over the Markdown whose declared type the documentation rules
 * judge, so product documentation names no symbol it must keep true.
 */
export const judgeTypedDocReferences: Rule = {
  id: 'docs.references',
  since: 4,
  remedy: referencesRemedy,
  judge: (reading) => judgeReferences(reading, (path) => isTypedDocumentation(reading.files, path)),
};

/**
 * The file that declares each exported name, of every shown source file a reader reads at the
 * pin but those `.gitattributes` marks generated or vendored: a name a file passes on from
 * another module is the other's, so a barrel is never named.
 */
function indexExports(reading: RuleReading): ReadonlyMap<string, string> {
  const attributes = readAttributes(reading.files);
  const declaring = new Map<string, string>();
  for (const path of reading.files.listVisible(repositoryScope)) {
    if (isGeneratedFile(attributes, path)) continue;
    for (const { name, exported, reexported } of readSourceFile(reading, path)?.declarations ??
      []) {
      if (exported && !reexported && !declaring.has(name)) declaring.set(name, path);
    }
  }
  return declaring;
}

/** `code` as the symbol it may name: without a `()` after it. */
const symbolOf = (code: string): string => code.replace(/\(\)$/u, '');

/** A plain lower-case word (`main`, `build`), which reads as prose whatever a file exports. */
const plainWord = /^[a-z][a-z0-9]*$/u;

/** The breaches of the documentation `selection` chooses (see {@link judgeDocSpans}). */
function judgeSpans(reading: RuleReading, selection: DocSelection): Breach[] {
  const { files, scope, references } = reading;
  if (references.kind === 'within-project') return [];
  const declaring = indexExports(reading);
  return files
    .listVisible(scope)
    .filter((path) => selectsDocumentation(files, path, selection))
    .flatMap((path) => {
      const markdown = readMarkdown(files.readText(path), true);
      const typed = markdown.links.map((link) => readTypedLink(reading, path, link));
      const judged = new Set<number>();
      const breaches: Breach[] = [];
      for (const { code, line, link } of markdown.spans) {
        const symbol = symbolOf(code);
        const owner = plainWord.test(symbol) ? undefined : declaring.get(symbol);
        if (owner === undefined || (link !== undefined && judged.has(link))) continue;
        if (link !== undefined && typed[link]?.fragment === symbol) continue;
        if (link !== undefined) judged.add(link);
        const where =
          link === undefined
            ? 'without linking it'
            : `in a link to ${markdown.links[link]?.destination ?? ''}`;
        breaches.push({
          path,
          message: `line ${String(line)} names the symbol ${symbol}, which ${owner} exports, ${where}`,
        });
      }
      for (const [index, link] of markdown.links.entries()) {
        const fragment = typed[index]?.fragment;
        if (judged.has(index) || link.code === undefined || fragment === undefined) continue;
        if (symbolOf(link.code) === fragment) continue;
        breaches.push({
          path,
          message: `line ${String(link.line)} links ${symbolOf(link.code)} to ${link.destination}, a fragment naming another symbol`,
          remedy: 'make the link text the symbol its fragment names',
        });
      }
      return breaches;
    });
}

const spansRemedy =
  'link the symbol to the file that declares it, as [`name`](path#name), its text the fragment';

/**
 * Every inline code span in the documentation the scope owns (see `selectsDocumentation`) that is a
 * name some source file exports (see `indexExports`), `()` after it allowed, is the text of a
 * typed reference whose fragment is that name: `[name](path#name)`, whether the span is the
 * link's whole text or part of it. A plain lower-case word is not judged. And a link whose text
 * is one code span agrees with its typed reference's fragment, so a link whose symbol was
 * renamed under its text fails too. One link gives at most one finding. Any project's source may
 * export a name, so a project check, whose reach is `within-project`, judges none; the
 * cross-project run and the whole check judge them all. Epoch 3; {@link judgeTypedDocSpans}
 * chooses the documentation by its declared type.
 */
export const judgeDocSpans: Rule = {
  id: 'docs.spans',
  since: 3,
  until: 4,
  remedy: spansRemedy,
  judge: (reading) => judgeSpans(reading, 'path'),
};

/** {@link judgeDocSpans} over the Markdown whose declared type the documentation rules judge. */
export const judgeTypedDocSpans: Rule = {
  id: 'docs.spans',
  since: 4,
  remedy: spansRemedy,
  judge: (reading) => judgeSpans(reading, 'type'),
};

/** The names every source file of the repository read at the pin declares for every file. */
function collectAmbient(reading: RuleReading): ReadonlySet<string> {
  const names = new Set<string>();
  for (const path of reading.files.listVisible(repositoryScope)) {
    for (const name of readSourceFile(reading, path)?.ambient ?? []) names.add(name);
  }
  return names;
}

/**
 * Every inline link of a doc comment of the files of `listCommentedFiles` names something: the
 * file itself resolves it (see `DocLink.resolved`), or its first name is a global of the
 * reader's installed libraries, or one some source file of the repository declares for every
 * file. Globals the reader cannot read are one finding of the first file needing them. Any
 * project may declare a global, so a project check judges none; the cross-project run and the
 * whole check judge them all.
 */
export const judgeDocLinks: Rule = {
  id: 'docs.comment-links',
  since: 3,
  remedy:
    'name it so it resolves where the comment is, or link it by a typed path#symbol reference in prose',
  judge(reading) {
    if (reading.references.kind === 'within-project') return [];
    let ambient: ReadonlySet<string> | undefined;
    let globalsFailed = false;
    return listCommentedFiles(reading).flatMap((path): Breach[] => {
      const reader = reading.sources.readerOf(path, reading.registry.rules);
      const read = readSourceFile(reading, path);
      if (reader === undefined || read === undefined) return [];
      return read.links.flatMap(({ target, line, head, resolved }): Breach[] => {
        if (resolved) return [];
        ambient ??= collectAmbient(reading);
        if (ambient.has(head)) return [];
        let globals: ReadonlySet<string>;
        try {
          globals = reader.globals();
        } catch (caught) {
          if (globalsFailed) return [];
          globalsFailed = true;
          const reason = caught instanceof Error ? caught.message : String(caught);
          return [
            {
              path,
              message: `line ${String(line)} links ${target}, but the globals cannot be read: ${reason}`,
              remedy: 'install puni with its dependencies, then check again',
            },
          ];
        }
        return globals.has(head)
          ? []
          : [
              {
                path,
                message: `line ${String(line)} links ${target}, which names nothing visible there`,
              },
            ];
      });
    });
  },
};
