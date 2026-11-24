import { join, posix } from 'node:path';
import {
  type CheckoutFilesResource,
  type LatestRules,
  readRulesSection,
  type RepositoryRegistryResource,
} from '@puni/shared-checkout';
import type { ProgramSource } from '@puni/shared-command';
import { SourceRulesMissing, SourceRulesStale } from './failures';

/** What a new or upgraded repository takes from the checkout `puni` runs from. */
export interface SourceCheckout {
  /** The rules section of its `AGENTS.md`, byte for byte: that of the latest epoch. */
  readonly rules: string;
  /** The owner of its system-state remote. */
  readonly owner: string;
}

/**
 * The {@link SourceCheckout} of the system-state repository of the nearest `puni.json` above
 * `programSource.directory`.
 *
 * @throws SourceRulesMissing when its `AGENTS.md` has no rules section.
 * @throws SourceRulesStale when that section is not the rules of `latestRules.epoch`.
 */
export function readSourceCheckout({
  checkoutRegistry,
  checkoutFiles,
  programSource,
  latestRules,
}: {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly programSource: ProgramSource;
  readonly latestRules: LatestRules;
}): SourceCheckout {
  const found = checkoutRegistry.locate(programSource.directory);
  const source = checkoutRegistry.resolve(found, 'system-state');
  const file = join(source.root, 'AGENTS.md');
  const rules = readRulesSection(
    checkoutFiles.open(source.root, source.type).readText('AGENTS.md'),
  );
  if (rules === undefined) throw new SourceRulesMissing({ details: { file } });
  if (!latestRules.holdsRulesOf(rules, latestRules.epoch)) {
    throw new SourceRulesStale({ details: { file, epoch: latestRules.epoch } });
  }
  const owner = posix.basename(posix.dirname(source.registry.repos['system-state'].remote.url));
  return { rules, owner };
}
