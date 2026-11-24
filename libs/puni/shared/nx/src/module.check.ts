import { DiBag } from 'di-bag';
import { nxModule } from './module';

DiBag.createBuilder().withInstalledModules([nxModule]).verifyGraphAtCompileTime() satisfies void;
