import { countWords, indexFile, renderIndex } from '@puni/shared-checkout';
import { indexWordBudget } from '../budgets';
import type { Finding, RuleReading } from '../finding';

/**
 * `wiki/index/` is exactly what `puni burokrat wiki index` would write. While its inputs have
 * defects it cannot be generated, which is itself a finding here.
 */
export function matchGeneratedIndex({ files, commands, wikiIndex }: RuleReading): Finding[] {
  const rule = 'index.current';
  const sources = wikiIndex.readSources(files);
  if (sources.defects.length > 0) {
    const count = String(sources.defects.length);
    return [
      {
        rule,
        path: 'wiki/index',
        message: `cannot be generated: ${count} index.read-when or index.read-first findings`,
      },
    ];
  }
  const drift = wikiIndex.compare(files, renderIndex(sources.entries, commands));
  const regenerate = '; run `puni burokrat wiki index`';
  return [
    ...drift.missing.map((path) => ({ rule, path, message: `is missing${regenerate}` })),
    ...drift.stale.map((path) => ({ rule, path, message: `is stale${regenerate}` })),
    ...drift.unexpected.map((path) => ({ rule, path, message: `is not generated${regenerate}` })),
  ];
}

/** The committed index stays within {@link indexWordBudget}; a missing one is `index.current`'s. */
export function limitIndexWords({ files }: RuleReading): Finding[] {
  if (!files.exists(indexFile)) return [];
  const words = countWords(files.readText(indexFile));
  if (words <= indexWordBudget) return [];
  const message = `has ${String(words)} words; at most ${String(indexWordBudget)}`;
  return [{ rule: 'index.words', path: indexFile, message }];
}

/** Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`. */
export function requireReadWhen({ files, scope, wikiIndex }: RuleReading): Finding[] {
  return wikiIndex
    .readScopeDefects(files, scope)
    .filter((defect) => defect.topic === 'read-when')
    .map((defect) => ({ rule: 'index.read-when', path: defect.path, message: defect.message }));
}

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export function requireReadFirst({ files, scope, wikiIndex }: RuleReading): Finding[] {
  return wikiIndex
    .readScopeDefects(files, scope)
    .filter((defect) => defect.topic === 'read-first')
    .map((defect) => ({ rule: 'index.read-first', path: defect.path, message: defect.message }));
}
