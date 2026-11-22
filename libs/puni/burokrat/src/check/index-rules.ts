import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { countWords, indexWordBudget } from '../budgets';
import { listFiles } from '../repository';
import {
  compareIndex,
  indexFile,
  readIndexSources,
  readProjectDefects,
  renderIndex,
  type SourceDefect,
} from '../wiki/wiki-index';
import type { Finding, RepositoryReading } from './finding';
import { type CheckScope, ownsPath } from './scope';

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

/**
 * The index-source defects `scope` judges. The whole repository and the root project read every
 * source and keep those the scope owns; another project reads only the `project.json` files in
 * its own directory, and only when it is indexed (under `apps/` or `libs/`).
 */
function readScopeDefects(root: string, scope: CheckScope): readonly SourceDefect[] {
  if (scope.kind === 'repository' || scope.project.directory === '.') {
    return readIndexSources(root).defects.filter((defect) => ownsPath(scope, defect.path));
  }
  const { directory } = scope.project;
  if (!/^(apps|libs)\//u.test(directory) || !existsSync(join(root, directory))) return [];
  return listFiles(root, directory)
    .filter((path) => posix.basename(path) === 'project.json' && ownsPath(scope, path))
    .flatMap((path) => readProjectDefects(root, path));
}

/** Every project has a valid `metadata.readWhen` and every page a valid `title` and `read-when`. */
export function requireReadWhen({ root, scope }: RepositoryReading): Finding[] {
  return readScopeDefects(root, scope)
    .filter((defect) => defect.topic === 'read-when')
    .map((defect) => ({ rule: 'index.read-when', path: defect.path, message: defect.message }));
}

/**
 * Every project's `metadata.readFirst` is a relative path inside the project naming an existing
 * regular file: the file its index line links to.
 */
export function requireReadFirst({ root, scope }: RepositoryReading): Finding[] {
  return readScopeDefects(root, scope)
    .filter((defect) => defect.topic === 'read-first')
    .map((defect) => ({ rule: 'index.read-first', path: defect.path, message: defect.message }));
}
