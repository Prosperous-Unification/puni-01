import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  fixtureRemotes,
  type ScratchDirectoryOwner,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { formatRegistry } from './registry';

/** Two checkouts side by side: `demo` holding `puni.json`, and the directory `demo-records`. */
export interface RegistryPair {
  readonly state: string;
  readonly records: string;
}

/** A fresh {@link RegistryPair} in one directory `scratchDirectories` creates and removes. */
export function makeRegistryPair(scratchDirectories: ScratchDirectoryOwner): RegistryPair {
  const parent = scratchDirectories.createDirectory('puni-registry-');
  const pair = { state: join(parent, 'demo'), records: join(parent, 'demo-records') };
  writeRepositoryFile(pair.state, 'puni.json', formatRegistry('system-state', fixtureRemotes, 1));
  mkdirSync(pair.records);
  return pair;
}
