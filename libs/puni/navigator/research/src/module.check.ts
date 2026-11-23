import { DiBag } from 'di-bag';
import type { ResearchRequirements } from './contract';
import { navigatorResearchModule } from './module';

declare const requirements: ResearchRequirements;

DiBag.createBuilder()
  .withInstalledModules([navigatorResearchModule])
  .withServices({ recordFiling: () => requirements.recordFiling })
  .verifyGraphAtCompileTime() satisfies void;
