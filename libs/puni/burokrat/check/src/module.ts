import { DiBag } from 'di-bag';
import { createCheckCommand } from './check.command';
import { createRepositoryCheck } from './repository-check.feature';
import { ruleSets } from './rule-set.rule';

/** `puni burokrat check`; the host supplies the checkout and records resources and the command catalog. */
export const burokratCheckModule = DiBag.createBuilder()
  .withServices({ checkRuleSets: () => ruleSets })
  .withServices({ repositoryCheck: createRepositoryCheck })
  .withServices({ burokratCheckCommand: createCheckCommand })
  .buildModule({
    exportedServiceKeys: ['burokratCheckCommand'],
    moduleLabel: 'puni-burokrat-check',
  });
