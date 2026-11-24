import { burokratAdrModule } from '@puni/burokrat-adr';
import { burokratAssessModule } from '@puni/burokrat-assess';
import { burokratCheckModule } from '@puni/burokrat-check';
import { burokratRepoModule } from '@puni/burokrat-repo';
import { burokratWikiModule } from '@puni/burokrat-wiki';
import { dashOpsModule } from '@puni/dash-ops';
import { dashResourcesModule } from '@puni/dash-resources';
import { dashRunModule } from '@puni/dash-run';
import { navigatorPlanModule } from '@puni/navigator-plan';
import { navigatorResearchModule } from '@puni/navigator-research';
import { nodeHostModule } from '@puni/shared-adapters';
import { checkoutModule } from '@puni/shared-checkout';
import { type CommandCatalog, listCommands, type ProgramSource } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { DiBag } from 'di-bag';
import { puniProgram } from './root-parser';

/**
 * The one `puni` graph: every module, and the host services they require over this machine.
 * Resolution is lazy, so a run builds only the services of its command. The program source is
 * the directory of this file, or of the bundle built from it, both inside the checkout `puni`
 * runs from, and the program's version.
 */
export const puniGraph = DiBag.createBuilder()
  .withInstalledModules([nodeHostModule])
  .withInstalledModules([checkoutModule, recordsModule])
  .withInstalledModules([
    navigatorPlanModule,
    navigatorResearchModule,
    dashOpsModule,
    dashRunModule,
    dashResourcesModule,
    burokratCheckModule,
    burokratWikiModule,
    burokratRepoModule,
    burokratAdrModule,
    burokratAssessModule,
  ])
  .withServices({
    commandCatalog: (): CommandCatalog => ({ list: () => listCommands(puniProgram) }),
    programSource: (): ProgramSource => ({
      directory: import.meta.dir,
      version: puniProgram.version,
    }),
  });

/** A fresh container of {@link puniGraph}; its owner closes it. */
export function createPuniContainer() {
  return puniGraph.buildContainer();
}

/** A container of {@link puniGraph}. */
export type PuniContainer = ReturnType<typeof createPuniContainer>;
