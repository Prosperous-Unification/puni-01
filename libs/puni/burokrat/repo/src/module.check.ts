import { DiBag } from 'di-bag';
import type { RepoRequirements } from './contract';
import { burokratRepoModule } from './module';

declare const requirements: RepoRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratRepoModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    commandCatalog: () => requirements.commandCatalog,
    programSource: () => requirements.programSource,
  })
  .verifyGraphAtCompileTime() satisfies void;
