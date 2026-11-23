import { DiBag } from 'di-bag';
import type { ResourcesRequirements } from './contract';
import { dashResourcesModule } from './module';
import type { ResourceWorktreesRequirements } from './worktrees.resource';

declare const requirements: ResourcesRequirements & ResourceWorktreesRequirements;

DiBag.createBuilder()
  .withInstalledModules([dashResourcesModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    git: () => requirements.git,
    processRunner: () => requirements.processRunner,
  })
  .verifyGraphAtCompileTime() satisfies void;
