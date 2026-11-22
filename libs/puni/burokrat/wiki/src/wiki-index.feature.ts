import { join } from 'node:path';
import { checkoutDefects, compareBytes, renderIndex, type Repository } from '@puni/shared-checkout';
import { findDefect } from '@puni/shared-failures';
import type { WikiIndexWriter, WikiRequirements } from './contract';

/**
 * The {@link WikiIndexWriter}: against the repository found from `cwd` it writes every missing
 * or stale file, removes every file under `wiki/index/` it did not generate, and reports what it
 * changed. A defect in the repository's inputs, or a repository whose `puni.json` declares a
 * `this-repo-type` other than `system-state`, writes nothing and is `refused`.
 */
export function createWikiIndexWriter({
  checkoutRegistry,
  checkoutFiles,
  checkoutWikiIndex,
  commandCatalog,
}: WikiRequirements): WikiIndexWriter {
  return {
    write(cwd) {
      let repository: Repository;
      try {
        repository = checkoutRegistry.locate(cwd);
      } catch (caught) {
        const defect = findDefect(caught, checkoutDefects);
        if (defect === undefined) throw caught;
        return { kind: 'refused', reason: defect.message };
      }
      if (repository.type !== 'system-state') {
        const file = join(repository.root, 'puni.json');
        return {
          kind: 'refused',
          reason: `wiki index needs the system-state repository; ${file} declares this-repo-type ${repository.type}`,
        };
      }
      const files = checkoutFiles.open(repository.root);
      const sources = checkoutWikiIndex.readSources(files);
      if (sources.defects.length > 0) {
        const named = sources.defects.map((defect) => `${defect.path}: ${defect.message}`);
        return { kind: 'refused', reason: named.join('; ') };
      }
      const expected = renderIndex(sources.entries, commandCatalog.list());
      const drift = checkoutWikiIndex.compare(files, expected);
      checkoutWikiIndex.write(files, expected, drift);
      return {
        kind: 'written',
        written: [...drift.missing, ...drift.stale].sort(compareBytes),
        removed: drift.unexpected,
      };
    },
  };
}
