import { DiBag } from 'di-bag';
import type { SkillsRequirements } from './contract';
import { burokratSkillsModule } from './module';
import type { SkillFilesRequirements } from './skill-files.resource';

declare const requirements: SkillsRequirements & SkillFilesRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratSkillsModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    fileSystem: () => requirements.fileSystem,
  })
  .verifyGraphAtCompileTime() satisfies void;
