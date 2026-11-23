import { DiBag } from 'di-bag';
import { createRepoInitCommand } from './repo-init.command';
import { createRepositoryPairSetup } from './repository-pair.feature';

/**
 * `puni burokrat repo init`; the host supplies the checkout resources, the command catalog and
 * the program source.
 */
export const burokratRepoModule = DiBag.createBuilder()
  .withServices({ repositoryPairSetup: createRepositoryPairSetup })
  .withServices({ burokratRepoInitCommand: createRepoInitCommand })
  .buildModule({
    exportedServiceKeys: ['burokratRepoInitCommand'],
    moduleLabel: 'puni-burokrat-repo',
  });
