import { DiBag } from 'di-bag';
import { createBunGit } from './bun-git.repository';
import { createBunProcessRunner } from './bun-process-runner.repository';
import { createNodeFileSystem } from './node-file-system.repository';

/** The host services of this machine, `fileSystem`, `processRunner` and `git`, as one module. */
export const nodeHostModule = DiBag.createBuilder()
  .withServices({ fileSystem: createNodeFileSystem, processRunner: createBunProcessRunner })
  .withServices({ git: createBunGit })
  .buildModule({
    exportedServiceKeys: ['fileSystem', 'git', 'processRunner'],
    moduleLabel: 'puni-shared-adapters',
  });
