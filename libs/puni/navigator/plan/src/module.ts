import { DiBag } from 'di-bag';
import { createPlanAddCommand } from './plan-add.command';

/** `puni navigator plan add`; the records module supplies the record filing. */
export const navigatorPlanModule = DiBag.createBuilder()
  .withServices({ navigatorPlanAddCommand: createPlanAddCommand })
  .buildModule({
    exportedServiceKeys: ['navigatorPlanAddCommand'],
    moduleLabel: 'puni-navigator-plan',
  });
