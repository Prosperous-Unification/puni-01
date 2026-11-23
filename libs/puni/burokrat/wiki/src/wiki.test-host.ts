import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatRegistry, renderIndex } from '@puni/shared-checkout';
import type { CommandBrief } from '@puni/shared-command';
import { fixtureRemotes, runGit, writeProject, writeRepositoryFile } from '@puni/shared-testing';

/** The command tree the fixture repository is indexed with. */
export const fixtureCommands: readonly CommandBrief[] = [
  { path: 'demo dash', brief: 'Do it.' },
  { path: 'demo dash ops', brief: 'Operate.' },
  { path: 'demo dash ops ssh', brief: 'Reach a node.' },
  { path: 'demo burokrat', brief: 'Judge.' },
  { path: 'demo burokrat check', brief: 'Check.' },
];

/**
 * A fresh git repository `demo` in a temporary directory, the index sources a wiki index needs:
 * `puni.json`, the root project, one project `one` under `apps/`, an empty `libs/`, and the
 * index generated from them. `removeFixture` deletes it.
 */
export function makeRepository(): string {
  const root = join(mkdtempSync(join(tmpdir(), 'puni-wiki-')), 'demo');
  writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes));
  writeRepositoryFile(root, 'project.json', JSON.stringify({ name: 'workspace' }));
  writeProject(root, 'apps/one', 'one', {
    readWhen: 'changing the one app',
    readFirst: 'src/index.ts',
  });
  mkdirSync(join(root, 'libs'));
  const entries = [
    { name: 'one', path: 'apps/one/src/index.ts', readWhen: 'changing the one app', scope: 'app' },
  ];
  for (const [path, text] of renderIndex(entries, fixtureCommands)) {
    writeRepositoryFile(root, path, text);
  }
  runGit(root, ['init', '-q']);
  runGit(root, ['add', '-A']);
  return root;
}
