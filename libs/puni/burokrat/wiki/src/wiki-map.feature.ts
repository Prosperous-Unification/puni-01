import { join } from 'node:path';
import {
  explainDefect,
  judgePurposes,
  listPartitions,
  listSections,
  readInvocation,
  readMapSources,
  renderPartitionMap,
  renderRootMap,
  renderSectionMap,
} from '@puni/shared-checkout';
import type { WikiMapOutcome, WikiMapPrinter, WikiRequirements } from './contract';

/**
 * The {@link WikiMapPrinter}: against the system-state repository found from `cwd` it reads the
 * map's sources (its wiki pages, and its projects through every one of `projectSources`) and the
 * purposes the `map` of its `puni.json` gives, and renders the root, or the wiki section whose
 * directory `argument` names, or else the partition it names. An argument naming neither is
 * `unknown`. Defects in the sources, each named with its remedy, every problem `judgePurposes`
 * finds in the purposes (the ones `index.purpose` reports), a file that cannot be read, a git that
 * cannot list the checkout, or a `puni.json` declaring a `this-repo-type` other than
 * `system-state`, are `refused`. Anything else propagates.
 */
export function createWikiMapPrinter({
  checkoutRegistry,
  checkoutFiles,
  projectSources,
}: WikiRequirements): WikiMapPrinter {
  const print = (cwd: string, argument: string | undefined): WikiMapOutcome => {
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
    const problems = judgePurposes(sources.projects, purposes);
    if (problems.length > 0) {
      const named = problems.map(({ message, remedy }) => `puni.json: ${message}; fix: ${remedy}`);
      return { kind: 'refused', reason: named.join('; ') };
    }
    const content = { ...sources, purposes, invocation: readInvocation(files) };
    if (argument === undefined) return { kind: 'printed', text: renderRootMap(content).text };
    const sections = listSections(sources.pages);
    const within = sections.find(({ directory }) => directory === argument);
    if (within !== undefined) {
      return { kind: 'printed', text: renderSectionMap(content, within).text };
    }
    const partitions = listPartitions(sources.projects);
    if (!partitions.includes(argument)) {
      return {
        kind: 'unknown',
        argument,
        partitions,
        sections: sections.map(({ directory }) => directory),
      };
    }
    return { kind: 'printed', text: renderPartitionMap(content, argument).text };
  };
  return {
    print(cwd, argument) {
      try {
        return print(cwd, argument);
      } catch (caught) {
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'refused', reason };
      }
    },
  };
}
