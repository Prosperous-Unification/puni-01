import { DiBag } from 'di-bag';
import type { CheckRequirements } from './contract';
import { burokratCheckModule } from './module';

declare const requirements: CheckRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratCheckModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    checkoutProjectScope: () => requirements.checkoutProjectScope,
    checkoutWikiIndex: () => requirements.checkoutWikiIndex,
    recordsCatalog: () => requirements.recordsCatalog,
    commandCatalog: () => requirements.commandCatalog,
    programSource: () => requirements.programSource,
  })
  .verifyGraphAtCompileTime() satisfies void;
