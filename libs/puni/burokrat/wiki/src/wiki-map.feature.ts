import { join } from 'node:path';
import {
  explainDefect,
  judgePurposes,
  listPartitions,
  readInvocation,
  readMapSources,
  renderPartitionMap,
  renderRootMap,
} from '@puni/shared-checkout';
import type { WikiMapOutcome, WikiMapPrinter, WikiRequirements } from './contract';

/**
 * The {@link WikiMapPrinter}: against the system-state repository found from `cwd` it reads the
 * map's sources (its wiki pages, and its projects through every one of `projectSources`) and the
 * purposes the `map` of its `puni.json` gives, and renders the root or the named partition. A
 * partition the map does not show is `unknown`. Defects in the sources, each named with its
 * remedy, a partition the map shows without a purpose, a file that cannot be read, a git that
 * cannot list the checkout, or a `puni.json` declaring a `this-repo-type` other than
 * `system-state`, are `refused`. Anything else propagates.
 */
export function createWikiMapPrinter({
  checkoutRegistry,
  checkoutFiles,
  projectSources,
}: WikiRequirements): WikiMapPrinter {
  const print = (cwd: string, partition: string | undefined): WikiMapOutcome => {
    const repository = checkoutRegistry.locate(cwd);
    if (repository.type !== 'system-state') {
      const file = join(repository.root, 'puni.json');
      return {
        kind: 'refused',
        reason: `wiki map needs the system-state repository; ${file} declares this-repo-type ${repository.type}`,
      };
    }
    const files = checkoutFiles.open(repository.root, repository.type);
    const sources = readMapSources(files, projectSources);
    if (sources.defects.length > 0) {
      const named = sources.defects.map(
        (defect) => `${defect.path}: ${defect.message}; fix: ${defect.remedy}`,
      );
      return { kind: 'refused', reason: named.join('; ') };
    }
    const purposes = repository.registry.map;
    const { missing } = judgePurposes(sources.projects, purposes);
    if (missing.length > 0) {
      return {
        kind: 'refused',
        reason: `the map of puni.json gives no purpose for the partitions ${missing.join(', ')}; fix: give each a phrase completing "Read this when …"`,
      };
    }
    const content = { ...sources, purposes, invocation: readInvocation(files) };
    if (partition === undefined) return { kind: 'printed', text: renderRootMap(content) };
    const partitions = listPartitions(sources.projects);
    if (!partitions.includes(partition)) return { kind: 'unknown', partition, partitions };
    return { kind: 'printed', text: renderPartitionMap(content, partition) };
  };
  return {
    print(cwd, partition) {
      try {
        return print(cwd, partition);
      } catch (caught) {
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'refused', reason };
      }
    },
  };
}
