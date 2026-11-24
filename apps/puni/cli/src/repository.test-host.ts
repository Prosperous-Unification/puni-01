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
 * A fresh system-state git repository `demo` in a directory `scratch` creates, nothing staged:
 * `puni.json`, one project `one` under `apps/` whose index line reads "changing one", and an
 * empty `libs/`. `scratch` removes it and anything built beside it.
 */
export function makeStateRepository(scratch: ScratchDirectoryOwner): string {
  const root = join(scratch.createDirectory('puni-cli-'), 'demo');
  writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes));
  writeProject(root, 'apps/one', 'one', { readWhen: 'changing one', readFirst: 'src/index.ts' });
  writeRepositoryFile(root, 'libs/.gitkeep', '');
  runGit(root, ['init', '-q']);
  return root;
}
