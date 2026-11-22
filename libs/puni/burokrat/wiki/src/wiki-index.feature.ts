import { join } from 'node:path';
import {
  type CheckoutFiles,
  checkoutDefects,
  compareBytes,
  renderIndex,
  type Repository,
} from '@puni/shared-checkout';
import { findDefect } from '@puni/shared-failures';
import type { WikiIndexWriter, WikiRequirements } from './contract';

type Rendered =
  | {
      readonly kind: 'rendered';
      readonly files: CheckoutFiles;
      readonly expected: Map<string, string>;
    }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * The {@link WikiIndexWriter}: against the repository found from `cwd` it renders the index;
 * writing, it writes every missing or stale file, removes every file under `wiki/index/` it did
 * not generate, and reports what it changed. A defect in the repository's inputs, or a repository whose `puni.json` declares a
 * `this-repo-type` other than `system-state`, writes nothing and is `refused`.
 */
export function createWikiIndexWriter({
  checkoutRegistry,
  checkoutFiles,
  checkoutWikiIndex,
  commandCatalog,
}: WikiRequirements): WikiIndexWriter {
  const render = (cwd: string): Rendered => {
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
    return {
      kind: 'rendered',
      files,
      expected: renderIndex(sources.entries, commandCatalog.list()),
    };
  };
  return {
    render(cwd) {
      const rendered = render(cwd);
      return rendered.kind === 'refused'
        ? rendered
        : { kind: 'rendered', files: rendered.expected };
    },
    write(cwd) {
      const rendered = render(cwd);
      if (rendered.kind === 'refused') return rendered;
      const { files, expected } = rendered;
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
