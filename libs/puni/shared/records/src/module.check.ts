import { DiBag } from 'di-bag';
import type { RecordsRequirements } from './contract';
import { recordsModule } from './module';

declare const requirements: RecordsRequirements;

DiBag.createBuilder()
  .withInstalledModules([recordsModule])
  .withServices({ clock: () => requirements.clock, fileSystem: () => requirements.fileSystem })
  .verifyGraphAtCompileTime() satisfies void;
