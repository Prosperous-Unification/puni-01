import { DiBag } from 'di-bag';
import type { WikiRequirements } from './contract';
import { burokratWikiModule } from './module';

declare const requirements: WikiRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratWikiModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    checkoutWikiIndex: () => requirements.checkoutWikiIndex,
    commandCatalog: () => requirements.commandCatalog,
  })
  .verifyGraphAtCompileTime() satisfies void;
