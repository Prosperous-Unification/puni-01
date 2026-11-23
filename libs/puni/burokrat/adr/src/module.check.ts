import { DiBag } from 'di-bag';
import type { AdrRequirements } from './contract';
import { burokratAdrModule } from './module';

declare const requirements: AdrRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratAdrModule])
  .withServices({ recordFiling: () => requirements.recordFiling })
  .verifyGraphAtCompileTime() satisfies void;
