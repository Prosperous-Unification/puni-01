import {
  countWords,
  indexDirectory,
  renderIndex,
  repositoryScope,
  type SourceDefect,
  sourceDefectRemedies,
} from '@puni/shared-checkout';
import { indexWordBudget } from '../budgets';
import type { Rule } from '../finding';

/** The command that writes the index directly, without the Nx sync generator. */
const writeIndex = 'bun run puni burokrat wiki index';

/** The ids of the rules reporting index source defects, one per defect topic. */
const sourceRuleIds = Object.keys(sourceDefectRemedies).map((topic) => `index.${topic}`);

/** `ids` joined as a list ending in `conjunction`: `a, b or c`. */
function joinIds(ids: readonly string[], conjunction: string): string {
  return ids.length < 2
    ? ids.join('')
    : `${ids.slice(0, -1).join(', ')} ${conjunction} ${ids.at(-1) ?? ''}`;
}

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
          message: `cannot be generated: ${count} ${joinIds(sourceRuleIds, 'or')} findings`,
          remedy: `fix the ${joinIds(sourceRuleIds, 'and')} findings, then run \`${writeIndex}\``,
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

/**
 * Every committed file of `wiki/index/` stays within {@link indexWordBudget}, each judged alone;
 * a missing one is `index.current`'s.
 */
export const limitIndexWords: Rule = {
  id: 'index.words',
  remedy: `shorten the readWhen of projects, the read-when of pages and the command briefs until each file of ${indexDirectory}/ holds at most ${String(indexWordBudget)} words, then run \`${writeIndex}\``,
  judge: ({ files }) =>
    files
      .listVisible(repositoryScope)
      .filter((path) => path.startsWith(`${indexDirectory}/`))
      .flatMap((path) => {
        const words = countWords(files.readText(path));
        if (words <= indexWordBudget) return [];
        return [
          { path, message: `has ${String(words)} words; at most ${String(indexWordBudget)}` },
        ];
      }),
};

/** The index source defects of `topic`, as findings. */
function judgeSources(topic: SourceDefect['topic']): Rule['judge'] {
  return ({ files, wikiIndex }) =>
    wikiIndex
      .readSources(files)
      .defects.filter((defect) => defect.topic === topic)
      .map(({ path, message }) => ({ path, message }));
}

/**
 * Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`.
 * The root project judges every source: its check reads every `project.json`.
 */
export const requireReadWhen: Rule = {
  id: 'index.read-when',
  remedy: sourceDefectRemedies['read-when'],
  judge: judgeSources('read-when'),
};

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export const requireReadFirst: Rule = {
  id: 'index.read-first',
  remedy: sourceDefectRemedies['read-first'],
  judge: judgeSources('read-first'),
};

/** Every project has exactly one `scope:<name>` tag, naming the index partition that lists it. */
export const requireScope: Rule = {
  id: 'index.scope',
  remedy: sourceDefectRemedies.scope,
  judge: judgeSources('scope'),
};

/**
 * Every authored page lies directly in `wiki/` or in one of the sections `wikiSections` names, so
 * the index can list it under its section and a reader knows what kind of page it is.
 */
export const requireSection: Rule = {
  id: 'index.section',
  remedy: sourceDefectRemedies.section,
  judge: judgeSources('section'),
};
