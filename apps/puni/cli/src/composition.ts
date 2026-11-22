import { burokratCheckModule } from '@puni/burokrat-check';
import { burokratWikiModule } from '@puni/burokrat-wiki';
import { dashOpsModule } from '@puni/dash-ops';
import { navigatorPlanModule } from '@puni/navigator-plan';
import { nodeHostModule } from '@puni/shared-adapters';
import { checkoutModule } from '@puni/shared-checkout';
import { type CommandCatalog, listCommands } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { DiBag } from 'di-bag';
import { puniProgram } from './root-parser';

/**
 * The one `puni` graph: every module, and the host services they require over this machine.
 * Resolution is lazy, so a run builds only the services of its command.
 */
export const puniGraph = DiBag.createBuilder()
  .withInstalledModules([nodeHostModule])
  .withInstalledModules([checkoutModule, recordsModule])
  .withInstalledModules([
    navigatorPlanModule,
    dashOpsModule,
    burokratCheckModule,
    burokratWikiModule,
  ])
  .withServices({
    commandCatalog: (): CommandCatalog => ({ list: () => listCommands(puniProgram) }),
  });

/** A fresh container of {@link puniGraph}; its owner closes it. */
export function createPuniContainer() {
  return puniGraph.buildContainer();
}

/** A container of {@link puniGraph}. */
export type PuniContainer = ReturnType<typeof createPuniContainer>;
