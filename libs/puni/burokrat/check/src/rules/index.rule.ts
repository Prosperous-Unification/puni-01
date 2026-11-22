import { countWords, indexFile, renderIndex } from '@puni/shared-checkout';
import { indexWordBudget } from '../budgets';
import type { Rule } from '../finding';

/**
 * `wiki/index/` is exactly what `puni burokrat wiki index` would write. While its inputs have
 * defects it cannot be generated, which is itself a breach here.
 */
export const matchGeneratedIndex: Rule = {
  id: 'index.current',
  remedy: 'run `bun run fix`',
  judge({ files, commands, wikiIndex }) {
    const sources = wikiIndex.readSources(files);
    if (sources.defects.length > 0) {
      const count = String(sources.defects.length);
      return [
        {
          path: 'wiki/index',
          message: `cannot be generated: ${count} index.read-when or index.read-first findings`,
          remedy: 'fix the index.read-when and index.read-first findings, then run `bun run fix`',
        },
      ];
    }
    const drift = wikiIndex.compare(files, renderIndex(sources.entries, commands));
    return [
      ...drift.missing.map((path) => ({ path, message: 'is missing' })),
      ...drift.stale.map((path) => ({ path, message: 'is stale' })),
      ...drift.unexpected.map((path) => ({ path, message: 'is not generated' })),
    ];
  },
};

/** The committed index stays within {@link indexWordBudget}; a missing one is `index.current`'s. */
export const limitIndexWords: Rule = {
  id: 'index.words',
  remedy: `shorten the readWhen of projects and the read-when of pages until ${indexFile} holds at most ${String(indexWordBudget)} words, then run \`bun run fix\``,
  judge({ files }) {
    if (!files.exists(indexFile)) return [];
    const words = countWords(files.readText(indexFile));
    if (words <= indexWordBudget) return [];
    return [
      {
        path: indexFile,
        message: `has ${String(words)} words; at most ${String(indexWordBudget)}`,
      },
    ];
  },
};

/** Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`. */
export const requireReadWhen: Rule = {
  id: 'index.read-when',
  remedy:
    'give it a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words (a page holds it as front matter with a title)',
  judge: ({ files, scope, wikiIndex }) =>
    wikiIndex
      .readScopeDefects(files, scope)
      .filter((defect) => defect.topic === 'read-when')
      .map(({ path, message }) => ({ path, message })),
};

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export const requireReadFirst: Rule = {
  id: 'index.read-first',
  remedy: 'set metadata.readFirst to the path, relative to the project, of the file to read first',
  judge: ({ files, scope, wikiIndex }) =>
    wikiIndex
      .readScopeDefects(files, scope)
      .filter((defect) => defect.topic === 'read-first')
      .map(({ path, message }) => ({ path, message })),
};
