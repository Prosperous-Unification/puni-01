import { join, posix } from 'node:path';
import {
  type CheckoutFilesResource,
  readRulesSection,
  type RepositoryRegistryResource,
} from '@puni/shared-checkout';
import type { ProgramSource } from '@puni/shared-command';
import { SourceRulesMissing } from './failures';

/** What a new or upgraded repository takes from the checkout `puni` runs from. */
export interface SourceCheckout {
  /** The rules section of its `AGENTS.md`, byte for byte. */
  readonly rules: string;
  /** The owner of its system-state remote. */
  readonly owner: string;
}

/**
 * The {@link SourceCheckout} of the system-state repository of the nearest `puni.json` above
 * `programSource.directory`.
 *
 * @throws SourceRulesMissing when its `AGENTS.md` has no rules section.
 */
export function readSourceCheckout({
  checkoutRegistry,
  checkoutFiles,
  programSource,
}: {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly programSource: ProgramSource;
}): SourceCheckout {
  const found = checkoutRegistry.locate(programSource.directory);
  const source = checkoutRegistry.resolve(found, 'system-state');
  const file = join(source.root, 'AGENTS.md');
  const rules = readRulesSection(
    checkoutFiles.open(source.root, source.type).readText('AGENTS.md'),
  );
  if (rules === undefined) throw new SourceRulesMissing({ details: { file } });
  const owner = posix.basename(posix.dirname(source.registry.repos['system-state'].remote.url));
  return { rules, owner };
}
