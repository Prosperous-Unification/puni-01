import { DiBag } from 'di-bag';
import { createBunGit } from './bun-git.repository';
import { createBunProcessRunner } from './bun-process-runner.repository';
import { createNodeFileSystem } from './node-file-system.repository';
import { createSystemClock } from './system-clock.repository';

/** The host services of this machine, `fileSystem`, `processRunner`, `git` and `clock`, as one module. */
export const nodeHostModule = DiBag.createBuilder()
  .withServices({
    fileSystem: createNodeFileSystem,
    processRunner: createBunProcessRunner,
    clock: createSystemClock,
  })
  .withServices({ git: createBunGit })
  .buildModule({
    exportedServiceKeys: ['clock', 'fileSystem', 'git', 'processRunner'],
    moduleLabel: 'puni-shared-adapters',
  });
