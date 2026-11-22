import { DiBag } from 'di-bag';
import type { OpsRequirements } from './contract';
import { dashOpsModule } from './module';
import type { RemoteShellRequirements } from './remote-shell.resource';

declare const requirements: OpsRequirements & RemoteShellRequirements;

DiBag.createBuilder()
  .withInstalledModules([dashOpsModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    processRunner: () => requirements.processRunner,
  })
  .verifyGraphAtCompileTime() satisfies void;
