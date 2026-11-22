import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countWords, indexWordBudget } from '../budgets';
import { compareIndex, indexFile, readIndexSources, renderIndex } from '../wiki/wiki-index';
import type { Finding, RepositoryReading } from './finding';

/**
 * `wiki/index/` is exactly what `puni burokrat wiki index` would write. While its inputs have
 * defects it cannot be generated, which is itself a finding here.
 */
export function matchGeneratedIndex({ root, commands }: RepositoryReading): Finding[] {
  const rule = 'index.current';
  const sources = readIndexSources(root);
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
  const drift = compareIndex(root, renderIndex(sources.entries, commands));
  const regenerate = '; run `puni burokrat wiki index`';
  return [
    ...drift.missing.map((path) => ({ rule, path, message: `is missing${regenerate}` })),
    ...drift.stale.map((path) => ({ rule, path, message: `is stale${regenerate}` })),
    ...drift.unexpected.map((path) => ({ rule, path, message: `is not generated${regenerate}` })),
  ];
}

/** The committed index stays within {@link indexWordBudget}; a missing one is `index.current`'s. */
export function limitIndexWords({ root }: RepositoryReading): Finding[] {
  if (!existsSync(join(root, indexFile))) return [];
  const words = countWords(readFileSync(join(root, indexFile), 'utf8'));
  if (words <= indexWordBudget) return [];
  const message = `has ${String(words)} words; at most ${String(indexWordBudget)}`;
  return [{ rule: 'index.words', path: indexFile, message }];
}

/** Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`. */
export function requireReadWhen({ root }: RepositoryReading): Finding[] {
  return readIndexSources(root)
    .defects.filter((defect) => defect.topic === 'read-when')
    .map((defect) => ({ rule: 'index.read-when', path: defect.path, message: defect.message }));
}

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export function requireReadFirst({ root }: RepositoryReading): Finding[] {
  return readIndexSources(root)
    .defects.filter((defect) => defect.topic === 'read-first')
    .map((defect) => ({ rule: 'index.read-first', path: defect.path, message: defect.message }));
}
