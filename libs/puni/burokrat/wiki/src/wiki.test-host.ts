import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatRegistry } from '@puni/shared-checkout';
import {
  fixtureRemotes,
  runGit,
  type ScratchDirectoryOwner,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';

/** The `puni.json` of a fixture repository whose map gives `map` as the partitions' purposes. */
export function formatFixtureRegistry(map: Readonly<Record<string, string>>): string {
  return formatRegistry('system-state', fixtureRemotes, 1, new Map(Object.entries(map)));
}

/**
 * A fresh git repository `demo` in a directory `scratchDirectories` creates, holding what a map
 * needs: `puni.json` giving the partition `app` its purpose, the root project, one project `one`
 * under `apps/` tagged `scope:app`, an empty `libs/`, and the page `wiki/gate.md`.
 * `scratchDirectories` removes it.
 */
export function makeRepository(scratchDirectories: ScratchDirectoryOwner): string {
  const root = join(scratchDirectories.createDirectory('puni-wiki-'), 'demo');
  writeRepositoryFile(root, 'puni.json', formatFixtureRegistry({ app: 'changing the app' }));
  writeRepositoryFile(root, 'project.json', JSON.stringify({ name: 'workspace' }));
  writeProject(root, 'apps/one', 'one', {
    readWhen: 'changing the one app',
    readFirst: 'src/index.ts',
  });
  mkdirSync(join(root, 'libs'));
  writeRepositoryFile(root, 'wiki/gate.md', '---\ntitle: Gate\nread-when: the gate fails\n---\n');
  runGit(root, ['init', '-q']);
  runGit(root, ['add', '-A']);
  return root;
}
