import { DiBag } from 'di-bag';
import { createRepoInitCommand } from './repo-init.command';
import { createRepoUpgradeCommand } from './repo-upgrade.command';
import { createRepositoryPairSetup } from './repository-pair.feature';
import { createRulesPinUpgrade } from './rules-pin.feature';

/**
 * `puni burokrat repo init` and `repo upgrade`; the host supplies the checkout resources, the
 * program source and the latest rules.
 */
export const burokratRepoModule = DiBag.createBuilder()
  .withServices({
    repositoryPairSetup: createRepositoryPairSetup,
    rulesPinUpgrade: createRulesPinUpgrade,
  })
  .withServices({
    burokratRepoInitCommand: createRepoInitCommand,
    burokratRepoUpgradeCommand: createRepoUpgradeCommand,
  })
  .buildModule({
    exportedServiceKeys: ['burokratRepoInitCommand', 'burokratRepoUpgradeCommand'],
    moduleLabel: 'puni-burokrat-repo',
  });
