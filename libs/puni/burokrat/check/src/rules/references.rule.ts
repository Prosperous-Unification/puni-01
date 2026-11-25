import { posix } from 'node:path';
import {
  findOwner,
  isMarkdown,
  type MarkdownOptions,
  readMarkdown,
  repositoryScope,
  type SourceReader,
} from '@puni/shared-checkout';

/** How the typed-reference rules read Markdown: front matter and HTML comments hold nothing. */
const skipHidden: MarkdownOptions = { frontMatter: 'skip', comments: 'skip' };
import { type DocSelection, isTypedDocumentation, selectsDocumentation } from '../docs';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { isGeneratedFile, readAttributes } from '../generated-files';
import { resolveTarget } from '../links';
import { readSourceFile } from '../source-files';
import { readTypedLink, splitDestination } from '../typed-links';
import { listCommentedFiles } from './docs.rule';

/**
 * The extensions a re-export may leave out or replace, in the order TypeScript tries them: its
 * own, then `.d.ts`, then JavaScript's; a `.js`, `.mjs` or `.cjs` written names the TypeScript
 * file beside it first.
 */
const moduleExtensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
const typescriptFor: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx', '.d.ts'],
  '.jsx': ['.tsx', '.d.ts'],
  '.mjs': ['.mts', '.d.mts'],
  '.cjs': ['.cts', '.d.cts'],
};

/**
 * The file a re-export of `specifier` from the file at `from` names, among the shown files a
 * source reader reads at the pin, tried in TypeScript's order: for a JavaScript extension, the
 * TypeScript files it stands for (see `typescriptFor`) and then the path itself; for any other,
 * the path itself, then followed by each of `moduleExtensions`, then its `index` file by each.
 * A bare package name names none here.
 */
function resolveModule(reading: RuleReading, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const written = posix.extname(base);
  const stem = base.slice(0, base.length - written.length);
  const mapped = typescriptFor[written];
  const candidates =
    mapped === undefined
      ? [
          base,
          ...moduleExtensions.map((extension) => `${base}${extension}`),
          ...moduleExtensions.map((extension) => `${base}/index${extension}`),
        ]
      : [...mapped.map((extension) => `${stem}${extension}`), base];
  return candidates.find(
    (candidate) =>
      reading.files.describe(candidate) === 'file' &&
      reading.files.isShown(candidate) &&
      reading.sources.readerOf(candidate, reading.registry.rules) !== undefined,
  );
}

/** What `readDeclared` reads of a file and the modules it re-exports whole. */
interface Declared {
  readonly names: ReadonlySet<string>;
  /** The re-exports no file resolves to. */
  readonly unfollowed: readonly string[];
  /** Whether a module it re-exports is another project's than the file's. */
  readonly crossed: boolean;
  /** Whether such a module was left unread, its project not the run's to read. */
  readonly deferred: boolean;
}

/**
 * The names the file at `path` declares, and those of every module it re-exports whole, hop
 * after hop (`export *` passes on no `default`). A project check, its reach `within-project`,
 * reads no module another project owns, since its cache holds only its own files: the
 * cross-project run follows it.
 */
function readDeclared(reading: RuleReading, path: string): Declared {
  const { references } = reading;
  const projects = references.kind === 'all' ? [] : references.projects;
  const owner = findOwner(projects, path);
  const names = new Set<string>();
  const unfollowed: string[] = [];
  const seen = new Set<string>();
  let crossed = false;
  let deferred = false;
  const visit = (file: string, hop: number): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (references.kind !== 'all' && findOwner(projects, file) !== owner) {
      crossed = true;
      if (references.kind === 'within-project') {
        deferred = true;
        return;
      }
    }
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
  return { names, unfollowed, crossed, deferred };
}

/**
 * The breaches of the links of every Markdown file the scope owns (see
 * {@link judgeDocReferences}): a missing path in any of them, a typed reference only in those
 * `judgesTyped` chooses.
 */
function judgeReferences(reading: RuleReading, judgesTyped: (path: string) => boolean): Breach[] {
  const { files, scope, references } = reading;
  return files
    .listVisible(scope)
    .filter(isMarkdown)
    .flatMap((path) =>
      readMarkdown(files.readText(path), skipHidden).links.flatMap((link): Breach[] => {
        const { target } = splitDestination(link.destination);
        const resolved = target === '' ? undefined : resolveTarget(path, target);
        if (resolved === undefined) return [];
        const reached = reachesReference(references, path, resolved);
        if (!reached && references.kind !== 'cross-project') return [];
        if (reached && !path.endsWith('.md') && !files.isShown(resolved)) {
          return [
            {
              path,
              message: `line ${String(link.line)} links to missing ${target}`,
              remedy: 'point the link at a path that exists, or remove it',
            },
          ];
        }
        if (!judgesTyped(path)) return [];
        const typed = readTypedLink(reading, path, link);
        if (typed === undefined) return [];
        const { names, unfollowed, crossed, deferred } = readDeclared(reading, typed.resolved);
        if (!reached && !crossed) return [];
        if (deferred || names.has(typed.fragment)) return [];
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
 * those the run's reach judges; a project check judges no name a module of another project
 * would have to declare, which the cross-project run judges, as it does every typed reference
 * whose re-exports leave the linking file's project. Epoch 3, over every Markdown file; {@link judgeTypedDocReferences}
 * judges the documentation by its declared type.
 */
export const judgeDocReferences: Rule = {
  id: 'docs.references',
  since: 3,
  until: 4,
  remedy: referencesRemedy,
  judge: (reading) => judgeReferences(reading, () => true),
};

/**
 * {@link judgeDocReferences}, its typed references judged only in the Markdown whose declared
 * type the documentation rules judge, so product documentation names no symbol it must keep
 * true; a missing path is refused in every Markdown file `links.resolve` does not read, typed or
 * not, as at epoch 3.
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

/**
 * Link text that may name a symbol: a name, or a path of names (`Cart.total`). A flag, a command
 * or other code (`--project`, `bun run gate`) may link to any symbol's fragment.
 */
const symbolPath = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

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
      const markdown = readMarkdown(files.readText(path), skipHidden);
      const typed = markdown.links.map((link) => readTypedLink(reading, path, link));
      const judged = new Set<number>();
      const breaches: Breach[] = [];
      const given = new Set<string>();
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
        const message = `line ${String(line)} names the symbol ${symbol}, which ${owner} exports, ${where}`;
        if (given.has(message)) continue;
        given.add(message);
        breaches.push({ path, message });
      }
      for (const [index, link] of markdown.links.entries()) {
        const fragment = typed[index]?.fragment;
        if (judged.has(index) || link.code === undefined || fragment === undefined) continue;
        const text = symbolOf(link.code);
        if (text === fragment || !symbolPath.test(text)) continue;
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
 * renamed under its text fails too, unless its text is no name but a flag or command. One link
 * gives at most one finding, as does a span repeated on one line. Any project's source may
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
 * file itself resolves it where the comment stands (see `DocLink.resolved`), or its first name
 * is a global of the libraries puni or the repository installs (see `SourceReader.globals`), or
 * one some source file of the repository declares for every file. A type package the
 * repository's configuration lists but does not install is one finding of the file listing it,
 * when the globals are first needed. Globals puni's own installation cannot give stop the check,
 * named, as no file's fault. Any project may declare a global, so a project check judges none;
 * the cross-project run and the whole check judge them all.
 */
export const judgeDocLinks: Rule = {
  id: 'docs.comment-links',
  since: 3,
  remedy:
    'name it so it resolves where the comment is, or link it by a typed path#symbol reference in prose',
  judge(reading) {
    if (reading.references.kind === 'within-project') return [];
    let ambient: ReadonlySet<string> | undefined;
    const breaches: Breach[] = [];
    const reported = new Set<SourceReader>();
    for (const path of listCommentedFiles(reading)) {
      const reader = reading.sources.readerOf(path, reading.registry.rules);
      const read = readSourceFile(reading, path);
      if (reader === undefined || read === undefined) continue;
      for (const { target, line, head, resolved } of read.links) {
        if (resolved) continue;
        ambient ??= collectAmbient(reading);
        if (ambient.has(head)) continue;
        const globals = reader.globals(reading.files.root);
        if (!reported.has(reader)) {
          reported.add(reader);
          for (const { name, listedIn } of globals.missing) {
            breaches.push({
              path: listedIn,
              message: `lists the types ${name}, which node_modules does not hold`,
              remedy: `install ${name}, or drop it from compilerOptions.types`,
            });
          }
        }
        if (!globals.names.has(head)) {
          breaches.push({
            path,
            message: `line ${String(line)} links ${target}, which names nothing visible there`,
          });
        }
      }
    }
    return breaches;
  },
};
