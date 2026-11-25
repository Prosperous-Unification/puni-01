import { DiBag } from 'di-bag';
import { typescriptModule } from './module';

DiBag.createBuilder()
  .withInstalledModules([typescriptModule])
  .verifyGraphAtCompileTime() satisfies void;
