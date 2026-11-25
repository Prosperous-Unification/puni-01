import { join } from 'node:path';
import { formatRegistry } from '@puni/shared-checkout';
import {
  fixtureRemotes,
  runGit,
  type ScratchDirectoryOwner,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';

/**
 * A fresh system-state git repository `demo` in a directory `scratchDirectories` creates, nothing
 * staged: `puni.json` pinned at rules epoch 2 giving the partition `app` the purpose "changing the
 * app", one project `one` under `apps/` whose map line reads "changing one", and an empty
 * `libs/`. `scratchDirectories` removes it and anything built beside it.
 */
export function makeStateRepository(scratchDirectories: ScratchDirectoryOwner): string {
  const root = join(scratchDirectories.createDirectory('puni-cli-'), 'demo');
  const purposes = new Map([['app', 'changing the app']]);
  writeRepositoryFile(
    root,
    'puni.json',
    formatRegistry('system-state', fixtureRemotes, 2, purposes),
  );
  writeProject(root, 'apps/one', 'one', { readWhen: 'changing one', readFirst: 'src/index.ts' });
  writeRepositoryFile(root, 'libs/.gitkeep', '');
  runGit(root, ['init', '-q']);
  return root;
}
