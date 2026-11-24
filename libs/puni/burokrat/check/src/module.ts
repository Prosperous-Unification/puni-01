import { DiBag } from 'di-bag';
import { createCheckCommand } from './check.command';
import { createLatestRules, createRepositoryCheck } from './repository-check.feature';
import { checkRules } from './rule-set.rule';

/**
 * `puni burokrat check`, and the latest rules it judges by for `puni burokrat repo upgrade`; the
 * host supplies the checkout and records resources, the command catalog and the program source.
 */
export const burokratCheckModule = DiBag.createBuilder()
  .withServices({ checkRules: () => checkRules })
  .withServices({ repositoryCheck: createRepositoryCheck, latestRules: createLatestRules })
  .withServices({ burokratCheckCommand: createCheckCommand })
  .buildModule({
    exportedServiceKeys: ['burokratCheckCommand', 'latestRules'],
    moduleLabel: 'puni-burokrat-check',
  });
