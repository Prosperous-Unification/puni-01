import { DiBag } from 'di-bag';
import type { RunRequirements } from './contract';
import { dashRunModule } from './module';

declare const requirements: RunRequirements;

DiBag.createBuilder()
  .withInstalledModules([dashRunModule])
  .withServices({ recordFiling: () => requirements.recordFiling })
  .verifyGraphAtCompileTime() satisfies void;
