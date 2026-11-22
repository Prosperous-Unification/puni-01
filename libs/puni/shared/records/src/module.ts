import { DiBag } from 'di-bag';
import { createRecordsCatalog } from './records.resource';

/** The records resources; the host supplies `clock` and `fileSystem`. */
export const recordsModule = DiBag.createBuilder()
  .withServices({ recordsCatalog: createRecordsCatalog })
  .buildModule({ exportedServiceKeys: ['recordsCatalog'], moduleLabel: 'puni-shared-records' });
