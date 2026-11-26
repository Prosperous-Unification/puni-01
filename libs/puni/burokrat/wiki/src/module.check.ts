import { DiBag } from 'di-bag';
import type { WikiRequirements } from './contract';
import { burokratWikiModule } from './module';

declare const requirements: WikiRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratWikiModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    projectSources: () => requirements.projectSources,
  })
  .verifyGraphAtCompileTime() satisfies void;
