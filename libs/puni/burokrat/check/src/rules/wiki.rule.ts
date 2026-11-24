import { countWords, repositoryScope } from '@puni/shared-checkout';
import { pageWordBudget } from '../budgets';
import { isDocumentation, isSymbolName, listCode } from '../docs';
import type { Breach, Rule } from '../finding';

/** The configuration files, beside those a source reader reads, whose words a symbol may be. */
const configurationFiles = /\.(?:json|ya?ml|toml|sh)$/u;

/** The symbol names (see {@link isSymbolName}) in the code spans and fenced blocks of `text`. */
export function listSymbolNames(text: string): string[] {
  return listCode(text).flatMap((code) =>
    [...code.matchAll(/[A-Za-z_$][\w$]*/gu)]
      .map((match) => match[0])
      .filter((word) => isSymbolName(word)),
  );
}

/**
 * Every symbol name the documentation's code names (see {@link listSymbolNames}) is a word of
 * some source file of the repository, so a step that names a function, type, key or variable
 * goes stale loudly when the code renames or removes it. Any project's source may hold a symbol,
 * so a cached project check, whose reach is `within-project`, judges none; the cross-project run
 * and the whole check, which read every file, judge them all. The source files are those a
 * source reader reads, from any epoch, since another file to find a word in only ever accepts
 * more, and the configuration files.
 */
export const judgeDocSymbols: Rule = {
  id: 'docs.symbols',
  since: 1,
  remedy: 'name the symbol as the code now spells it, or remove it',
  judge({ files, references, sources }) {
    if (references.kind === 'within-project') return [];
    const visible = files.listVisible(repositoryScope);
    const words = new Set<string>();
    for (const path of visible) {
      const isSource =
        sources.readerOf(path, Number.POSITIVE_INFINITY) !== undefined ||
        configurationFiles.test(path);
      if (!isSource || isDocumentation(path)) continue;
      for (const match of files.readText(path).matchAll(/[A-Za-z_$][\w$]*/gu)) words.add(match[0]);
    }
    return visible
      .filter(isDocumentation)
      .flatMap((path) =>
        [...new Set(listSymbolNames(files.readText(path)))]
          .filter((name) => !words.has(name))
          .map((name): Breach => ({ path, message: `names ${name}, which no source file holds` })),
      );
  },
};

/**
 * Every authored wiki page the scope owns holds at most {@link pageWordBudget} words, front
 * matter included: a page is read whole into an agent's context, so one that outgrows it splits
 * into pages that each answer one "Read this when …".
 */
export const limitPageWords: Rule = {
  id: 'docs.words',
  since: 1,
  remedy: `split the page into pages that each answer one read-when, or move what one library owns into its JSDoc, until each holds at most ${String(pageWordBudget)} words`,
  judge: ({ files, scope }) =>
    files
      .listVisible(scope)
      .filter((path) => isDocumentation(path) && path.startsWith('wiki/'))
      .flatMap((path) => {
        const words = countWords(files.readText(path));
        return words <= pageWordBudget
          ? []
          : [{ path, message: `has ${String(words)} words; at most ${String(pageWordBudget)}` }];
      }),
};
