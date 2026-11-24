import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatRegistry } from '@puni/shared-checkout';
import { fixtureRemotes, runGit, writeProject, writeRepositoryFile } from '@puni/shared-testing';

/**
 * A fresh system-state git repository `demo` in its own temporary directory, nothing staged:
 * `puni.json`, one project `one` under `apps/` whose index line reads "changing one", and an
 * empty `libs/`. `removeFixture` deletes it and anything built beside it.
 */
export function makeStateRepository(): string {
  const root = join(mkdtempSync(join(tmpdir(), 'puni-cli-')), 'demo');
  writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes, 1));
  writeProject(root, 'apps/one', 'one', { readWhen: 'changing one', readFirst: 'src/index.ts' });
  writeRepositoryFile(root, 'libs/.gitkeep', '');
  runGit(root, ['init', '-q']);
  return root;
}
