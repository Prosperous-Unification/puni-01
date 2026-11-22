import { DiBag } from 'di-bag';
import type { FileSystem, Git } from './contract';
import { checkoutModule } from './module';

declare const fileSystem: FileSystem;
declare const git: Git;

DiBag.createBuilder()
  .withInstalledModules([checkoutModule])
  .withServices({ fileSystem: () => fileSystem, git: () => git })
  .verifyGraphAtCompileTime() satisfies void;
