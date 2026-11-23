import { countWords, indexFile, renderIndex, sourceDefectRemedies } from '@puni/shared-checkout';
import { indexWordBudget } from '../budgets';
import type { Rule } from '../finding';

/** The command that writes the index directly, without the Nx sync generator. */
const writeIndex = 'bun run puni burokrat wiki index';

/**
 * `wiki/index/` is exactly what `puni burokrat wiki index` would write. While its inputs have
 * defects it cannot be generated, which is itself a breach here. The remedy runs that command,
 * not `bun run fix`, so it holds even when the sync generator is not registered.
 */
export const matchGeneratedIndex: Rule = {
  id: 'index.current',
  remedy: `run \`${writeIndex}\``,
  judge({ files, commands, wikiIndex }) {
    const sources = wikiIndex.readSources(files);
    if (sources.defects.length > 0) {
      const count = String(sources.defects.length);
      return [
        {
          path: 'wiki/index',
          message: `cannot be generated: ${count} index.read-when or index.read-first findings`,
          remedy: `fix the index.read-when and index.read-first findings, then run \`${writeIndex}\``,
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
  remedy: `shorten the readWhen of projects and the read-when of pages until ${indexFile} holds at most ${String(indexWordBudget)} words, then run \`${writeIndex}\``,
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

/**
 * Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`.
 * The root project judges every source: its check reads every `project.json`.
 */
export const requireReadWhen: Rule = {
  id: 'index.read-when',
  remedy: sourceDefectRemedies['read-when'],
  judge: ({ files, wikiIndex }) =>
    wikiIndex
      .readSources(files)
      .defects.filter((defect) => defect.topic === 'read-when')
      .map(({ path, message }) => ({ path, message })),
};

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export const requireReadFirst: Rule = {
  id: 'index.read-first',
  remedy: sourceDefectRemedies['read-first'],
  judge: ({ files, wikiIndex }) =>
    wikiIndex
      .readSources(files)
      .defects.filter((defect) => defect.topic === 'read-first')
      .map(({ path, message }) => ({ path, message })),
};
