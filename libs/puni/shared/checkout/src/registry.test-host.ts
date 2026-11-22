import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureRemotes, writeRepositoryFile } from '@puni/shared-testing';
import { formatRegistry } from './registry';

/** Two checkouts side by side: `demo` holding `puni.json`, and the directory `demo-records`. */
export interface RegistryPair {
  readonly state: string;
  readonly records: string;
}

/** A fresh {@link RegistryPair} in one temporary directory; `removeFixture` deletes both. */
export function makeRegistryPair(): RegistryPair {
  const parent = mkdtempSync(join(tmpdir(), 'puni-registry-'));
  const pair = { state: join(parent, 'demo'), records: join(parent, 'demo-records') };
  writeRepositoryFile(pair.state, 'puni.json', formatRegistry('system-state', fixtureRemotes));
  mkdirSync(pair.records);
  return pair;
}
