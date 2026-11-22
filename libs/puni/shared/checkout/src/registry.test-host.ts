import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRepositoryFile } from '@puni/shared-testing';
import { formatRegistry, type RepositoryType } from './registry';

/** The remote URL of each fixture repository; their last segments name the checkouts. */
export const fixtureRemotes: Readonly<Record<RepositoryType, string>> = {
  'system-state': 'https://github.com/acme/demo',
  'system-records': 'https://github.com/acme/demo-records',
};

/** The text of a valid `puni.json` for the fixture repository of `thisType`. */
export function formatFixtureRegistry(thisType: RepositoryType): string {
  return formatRegistry(thisType, fixtureRemotes);
}

/** Two checkouts side by side: `demo` holding `puni.json`, and the directory `demo-records`. */
export interface RegistryPair {
  readonly state: string;
  readonly records: string;
}

/** A fresh {@link RegistryPair} in one temporary directory; `removeFixture` deletes both. */
export function makeRegistryPair(): RegistryPair {
  const parent = mkdtempSync(join(tmpdir(), 'puni-registry-'));
  const pair = { state: join(parent, 'demo'), records: join(parent, 'demo-records') };
  writeRepositoryFile(pair.state, 'puni.json', formatFixtureRegistry('system-state'));
  mkdirSync(pair.records);
  return pair;
}
