import { DiBag } from 'di-bag';
import type { PlanRequirements } from './contract';
import { navigatorPlanModule } from './module';

declare const requirements: PlanRequirements;

DiBag.createBuilder()
  .withInstalledModules([navigatorPlanModule])
  .withServices({ recordFiling: () => requirements.recordFiling })
  .verifyGraphAtCompileTime() satisfies void;
