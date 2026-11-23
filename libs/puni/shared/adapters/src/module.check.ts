import { DiBag } from 'di-bag';
import { nodeHostModule } from './module';

DiBag.createBuilder()
  .withInstalledModules([nodeHostModule])
  .verifyGraphAtCompileTime() satisfies void;
