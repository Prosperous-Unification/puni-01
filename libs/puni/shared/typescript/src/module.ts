import { DiBag } from 'di-bag';
import { createTypescriptSourceReaders } from './source-readers.resource';

/** The TypeScript and JavaScript source readers; they need nothing from their host. */
export const typescriptModule = DiBag.createBuilder()
  .withServices({ typescriptSourceReaders: createTypescriptSourceReaders })
  .buildModule({
    exportedServiceKeys: ['typescriptSourceReaders'],
    moduleLabel: 'puni-shared-typescript',
  });
