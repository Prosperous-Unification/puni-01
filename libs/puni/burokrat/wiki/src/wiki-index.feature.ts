import { join } from 'node:path';
import {
  type CheckoutFiles,
  compareBytes,
  explainDefect,
  renderIndex,
  sourceDefectRemedies,
} from '@puni/shared-checkout';
import type { WikiIndexWriter, WikiRequirements } from './contract';

type Rendered =
  | {
      readonly kind: 'rendered';
      readonly files: CheckoutFiles;
      readonly expected: Map<string, string>;
    }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * `run()`, or the refusal its failure stands for: a defect of the repository's inputs (a git that
 * cannot list the checkout among them), its reason ending in `; fix: <remedy>`, or a file that
 * cannot be read. Anything else propagates.
 */
function refuseDefects<Outcome>(
  run: () => Outcome,
): Outcome | Extract<Rendered, { kind: 'refused' }> {
  try {
    return run();
  } catch (caught) {
    const reason = explainDefect(caught);
    if (reason === undefined) throw caught;
    return { kind: 'refused', reason };
  }
}

/**
 * The {@link WikiIndexWriter}: against the repository found from `cwd` it renders the index;
 * writing, it writes every missing or stale file, removes every file under `wiki/index/` it did
 * not generate, and reports what it changed. A defect in the repository's inputs, a file that
 * cannot be read, a git that cannot list the checkout, or a repository whose `puni.json`
 * declares a `this-repo-type` other than `system-state`, writes nothing and is `refused`; a
 * defect of the index sources names each defect with its remedy.
 */
export function createWikiIndexWriter({
  checkoutRegistry,
  checkoutFiles,
  checkoutWikiIndex,
  commandCatalog,
}: WikiRequirements): WikiIndexWriter {
  const render = (cwd: string): Rendered => {
    const repository = checkoutRegistry.locate(cwd);
    if (repository.type !== 'system-state') {
      const file = join(repository.root, 'puni.json');
      return {
        kind: 'refused',
        reason: `wiki index needs the system-state repository; ${file} declares this-repo-type ${repository.type}`,
      };
    }
    const files = checkoutFiles.open(repository.root, repository.type);
    const sources = checkoutWikiIndex.readSources(files);
    if (sources.defects.length > 0) {
      const named = sources.defects.map(
        (defect) => `${defect.path}: ${defect.message}; fix: ${sourceDefectRemedies[defect.topic]}`,
      );
      return { kind: 'refused', reason: named.join('; ') };
    }
    return {
      kind: 'rendered',
      files,
      expected: renderIndex(sources.entries, commandCatalog.list()),
    };
  };
  return {
    render: (cwd) =>
      refuseDefects(() => {
        const rendered = render(cwd);
        return rendered.kind === 'refused'
          ? rendered
          : { kind: 'rendered', files: rendered.expected };
      }),
    write: (cwd) =>
      refuseDefects(() => {
        const rendered = render(cwd);
        if (rendered.kind === 'refused') return rendered;
        const drift = checkoutWikiIndex.write(rendered.files, rendered.expected);
        return {
          kind: 'written',
          written: [...drift.missing, ...drift.stale].sort(compareBytes),
          removed: drift.unexpected,
        };
      }),
  };
}
