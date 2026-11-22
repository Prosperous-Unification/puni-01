import { DiBag } from 'di-bag';
import { createPlanAddCommand } from './plan-add.command';
import { createPlanFiling } from './plan-filing.feature';

/** `puni navigator plan add`; the host supplies the checkout and records resources. */
export const navigatorPlanModule = DiBag.createBuilder()
  .withServices({ planFiling: createPlanFiling })
  .withServices({ navigatorPlanAddCommand: createPlanAddCommand })
  .buildModule({
    exportedServiceKeys: ['navigatorPlanAddCommand'],
    moduleLabel: 'puni-navigator-plan',
  });
