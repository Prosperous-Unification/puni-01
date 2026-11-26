import type { ProjectSource } from '@puni/shared-checkout';

/** What the Nx module exports: the map's project source for an Nx workspace. */
export interface NxExports {
  readonly nxProjectSource: ProjectSource;
}
