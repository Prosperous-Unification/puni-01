import { DiBag } from 'di-bag';
import { createCheckoutFiles } from './checkout-files.resource';
import { createProjectScope } from './project-scope.resource';
import { createRepositoryRegistry } from './repository-registry.resource';
import { createWikiIndex } from './wiki-index.resource';

/** The checkout resources; the host supplies `fileSystem` and `git`. */
export const checkoutModule = DiBag.createBuilder()
  .withServices({
    checkoutRegistry: createRepositoryRegistry,
    checkoutFiles: createCheckoutFiles,
    checkoutProjectScope: createProjectScope,
    checkoutWikiIndex: createWikiIndex,
  })
  .buildModule({
    exportedServiceKeys: [
      'checkoutRegistry',
      'checkoutFiles',
      'checkoutProjectScope',
      'checkoutWikiIndex',
    ],
    moduleLabel: 'puni-shared-checkout',
  });
