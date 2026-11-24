import { DiBag } from 'di-bag';
import { createCheckoutFiles } from './checkout-files.resource';
import { createProjectScope } from './project-scope.resource';
import { createRepositoryRegistry } from './repository-registry.resource';

/** The checkout resources; the host supplies `fileSystem` and `git`. */
export const checkoutModule = DiBag.createBuilder()
  .withServices({
    checkoutRegistry: createRepositoryRegistry,
    checkoutFiles: createCheckoutFiles,
    checkoutProjectScope: createProjectScope,
  })
  .buildModule({
    exportedServiceKeys: ['checkoutRegistry', 'checkoutFiles', 'checkoutProjectScope'],
    moduleLabel: 'puni-shared-checkout',
  });
