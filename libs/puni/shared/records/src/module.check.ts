import { DiBag } from 'di-bag';
import { recordsModule } from './module';

DiBag.createBuilder()
  .withInstalledModules([recordsModule])
  .verifyGraphAtCompileTime() satisfies void;
