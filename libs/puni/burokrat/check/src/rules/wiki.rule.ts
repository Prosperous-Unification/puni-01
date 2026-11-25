import { countWords, readMarkdown, repositoryScope } from '@puni/shared-checkout';
import { pageWordBudget } from '../budgets';
import {
  type DocSelection,
  isDocumentation,
  isSymbolName,
  listCode,
  readDeclaredType,
  selectsDocumentation,
} from '../docs';
import type { Breach, Rule, RuleReading } from '../finding';
import { readAsBefore } from '../links';
import { readTypedLink } from '../typed-links';

/** The configuration files, beside those a source reader reads, whose words a symbol may be. */
const configurationFiles = /\.(?:json|ya?ml|toml|sh)$/u;

/** The symbol names (see {@link isSymbolName}) among the words of `code`. */
function symbolNamesOf(code: readonly string[]): string[] {
  return code.flatMap((piece) =>
    [...piece.matchAll(/[A-Za-z_$][\w$]*/gu)]
      .map((match) => match[0])
      .filter((word) => isSymbolName(word)),
  );
}

/**
 * The symbol names (see {@link isSymbolName}) in the code spans and fenced blocks of `text`, as
 * epochs 1 and 2 read them.
 */
export function listSymbolNames(text: string): string[] {
  return symbolNamesOf(listCode(text));
}

/**
 * The symbol names in the code of the Markdown file at `path`, as `readMarkdown` reads it with
 * `readAsBefore`, from epoch 3: its spans, but those in the text of a typed reference, whose
 * symbol `docs.references` and `docs.spans` judge, and the lines of its code blocks.
 */
function listReadSymbolNames(reading: RuleReading, path: string): string[] {
  const markdown = readMarkdown(reading.files.readText(path), readAsBefore);
  const typed = markdown.links.map((link) => readTypedLink(reading, path, link) !== undefined);
  return symbolNamesOf([
    ...markdown.spans
      .filter(({ link }) => link === undefined || typed[link] !== true)
      .map(({ code }) => code),
    ...markdown.codeLines.map(({ text }) => text),
  ]);
}

/**
 * The breaches of the symbol names of the documentation `selection` chooses, each file's names
 * listed by `listNames`.
 */
function judgeSymbols(
  reading: RuleReading,
  selection: DocSelection,
  listNames: (path: string) => readonly string[],
): Breach[] {
  const { files, references, sources } = reading;
  if (references.kind === 'within-project') return [];
  const visible = files.listVisible(repositoryScope);
  const isDoc = (path: string): boolean => selectsDocumentation(files, path, selection);
  const words = new Set<string>();
  for (const path of visible) {
    const isSource =
      sources.readerOf(path, Number.POSITIVE_INFINITY) !== undefined ||
      configurationFiles.test(path);
    if (!isSource || isDoc(path)) continue;
    for (const match of files.readText(path).matchAll(/[A-Za-z_$][\w$]*/gu)) words.add(match[0]);
  }
  return visible
    .filter(isDoc)
    .flatMap((path) =>
      [...new Set(listNames(path))]
        .filter((name) => !words.has(name))
        .map((name): Breach => ({ path, message: `names ${name}, which no source file holds` })),
    );
}

const symbolsRemedy = 'name the symbol as the code now spells it, or remove it';

/**
 * Every symbol name the documentation's code names (see {@link listSymbolNames}) is a word of
 * some source file of the repository, so a step that names a function, type, key or variable
 * goes stale loudly when the code renames or removes it. Any project's source may hold a symbol,
 * so a cached project check, whose reach is `within-project`, judges none; the cross-project run
 * and the whole check, which read every file, judge them all. The source files are those a
 * source reader reads, from any epoch, since another file to find a word in only ever accepts
 * more, and the configuration files. Epochs 1 and 2, the documentation chosen by its path and
 * read by {@link listSymbolNames}; {@link judgeReadDocSymbols} reads it as the other docs rules
 * do.
 */
export const judgeDocSymbols: Rule = {
  id: 'docs.symbols',
  since: 1,
  until: 3,
  remedy: symbolsRemedy,
  judge: (reading) =>
    judgeSymbols(reading, 'path', (path) => listSymbolNames(reading.files.readText(path))),
};

/**
 * {@link judgeDocSymbols} over the code `readMarkdown` reads (see `listReadSymbolNames`), a span
 * of a typed reference left to the rules judging those. Epoch 3; {@link judgeTypedDocSymbols}
 * chooses the documentation by its declared type.
 */
export const judgeReadDocSymbols: Rule = {
  id: 'docs.symbols',
  since: 3,
  until: 4,
  remedy: symbolsRemedy,
  judge: (reading) => judgeSymbols(reading, 'path', (path) => listReadSymbolNames(reading, path)),
};

/** {@link judgeReadDocSymbols} over the Markdown whose declared type the documentation rules judge. */
export const judgeTypedDocSymbols: Rule = {
  id: 'docs.symbols',
  since: 4,
  remedy: symbolsRemedy,
  judge: (reading) => judgeSymbols(reading, 'type', (path) => listReadSymbolNames(reading, path)),
};

/** The breaches of the pages `isPage` chooses among the visible files the scope owns. */
function judgePageWords(
  { files, scope }: RuleReading,
  isPage: (path: string) => boolean,
): Breach[] {
  return files
    .listVisible(scope)
    .filter(isPage)
    .flatMap((path) => {
      const words = countWords(files.readText(path));
      return words <= pageWordBudget
        ? []
        : [{ path, message: `has ${String(words)} words; at most ${String(pageWordBudget)}` }];
    });
}

const pageWordsRemedy = `split the page into pages that each answer one read-when, or move what one library owns into its JSDoc, until each holds at most ${String(pageWordBudget)} words`;

/**
 * Every authored wiki page the scope owns holds at most {@link pageWordBudget} words, front
 * matter included: a page is read whole into an agent's context, so one that outgrows it splits
 * into pages that each answer one "Read this when …". Epochs 1 to 3, a page chosen by its path;
 * {@link limitTypedPageWords} chooses it by its declared type.
 */
export const limitPageWords: Rule = {
  id: 'docs.words',
  since: 1,
  until: 4,
  remedy: pageWordsRemedy,
  judge: (reading) =>
    judgePageWords(reading, (path) => isDocumentation(path) && path.startsWith('wiki/')),
};

/** {@link limitPageWords} over every Markdown file declaring the type `wiki-page`. */
export const limitTypedPageWords: Rule = {
  id: 'docs.words',
  since: 4,
  remedy: pageWordsRemedy,
  judge: (reading) =>
    judgePageWords(reading, (path) => readDeclaredType(reading.files, path) === 'wiki-page'),
};
