import { DiBag } from 'di-bag';
import { createNxProjectSource } from './nx-projects.resource';

/** The Nx project source; it needs nothing from its host. */
export const nxModule = DiBag.createBuilder()
  .withServices({ nxProjectSource: createNxProjectSource })
  .buildModule({ exportedServiceKeys: ['nxProjectSource'], moduleLabel: 'puni-shared-nx' });
