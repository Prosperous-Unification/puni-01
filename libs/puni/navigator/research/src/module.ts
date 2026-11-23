import { DiBag } from 'di-bag';
import { createResearchAddCommand } from './research-add.command';

/** `puni navigator research add`; the records module supplies the record filing. */
export const navigatorResearchModule = DiBag.createBuilder()
  .withServices({ navigatorResearchAddCommand: createResearchAddCommand })
  .buildModule({
    exportedServiceKeys: ['navigatorResearchAddCommand'],
    moduleLabel: 'puni-navigator-research',
  });
