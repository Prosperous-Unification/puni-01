import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatRegistry, indexFile, renderIndex, type RepositoryType } from '@puni/shared-checkout';
import type { CommandBrief } from '@puni/shared-command';
import { runGit, writeProject, writeRepositoryFile } from '@puni/shared-testing';

/** The command tree the fixture repository is indexed with. */
export const fixtureCommands: readonly CommandBrief[] = [
  { path: 'demo dash', brief: 'Do it.' },
  { path: 'demo burokrat', brief: 'Judge.' },
];

/** The text of a valid `puni.json` for the fixture repository of `thisType`. */
export function formatFixtureRegistry(thisType: RepositoryType): string {
  return formatRegistry(thisType, {
    'system-state': 'https://github.com/acme/demo',
    'system-records': 'https://github.com/acme/demo-records',
  });
}

/**
 * A fresh git repository `demo` in a temporary directory, the index sources a wiki index needs:
 * `puni.json`, the root project, one project `one` under `apps/`, an empty `libs/`, and the
 * index generated from them. `removeFixture` deletes it.
 */
export function makeRepository(): string {
  const root = join(mkdtempSync(join(tmpdir(), 'puni-wiki-')), 'demo');
  writeRepositoryFile(root, 'puni.json', formatFixtureRegistry('system-state'));
  writeRepositoryFile(root, 'project.json', JSON.stringify({ name: 'workspace' }));
  writeProject(root, 'apps/one', 'one', {
    readWhen: 'changing the one app',
    readFirst: 'src/index.ts',
  });
  mkdirSync(join(root, 'libs'));
  const entries = [
    { name: 'one', path: 'apps/one/src/index.ts', readWhen: 'changing the one app' },
  ];
  const rendered = renderIndex(entries, fixtureCommands).get(indexFile);
  if (rendered === undefined) throw new Error(`${indexFile} was not rendered`);
  writeRepositoryFile(root, indexFile, rendered);
  runGit(root, ['init', '-q']);
  runGit(root, ['add', '-A']);
  return root;
}
