import { createBunGit, createBunProcessRunner, createNodeFileSystem } from '@puni/shared-adapters';
import type { FileSystem, Git, ProcessRunner } from '@puni/shared-ports';

/** Providers for `fileSystem`, `git` and `processRunner` over this machine, to pass to `withServices`. */
export function nodeHost() {
  const processRunner = createBunProcessRunner();
  const fileSystem = createNodeFileSystem();
  const git = createBunGit({ processRunner });
  return {
    fileSystem: (): FileSystem => fileSystem,
    git: (): Git => git,
    processRunner: (): ProcessRunner => processRunner,
  };
}
