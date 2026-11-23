import { DiBag } from 'di-bag';
import { createRecordFiling } from './record-filing.feature';
import { createRecordsCatalog } from './records.resource';

/**
 * The records resources and the one record filing path; the host supplies `clock` and
 * `fileSystem`, and the checkout module `checkoutRegistry` and `checkoutFiles`.
 */
export const recordsModule = DiBag.createBuilder()
  .withServices({ recordsCatalog: createRecordsCatalog })
  .withServices({ recordFiling: createRecordFiling })
  .buildModule({
    exportedServiceKeys: ['recordsCatalog', 'recordFiling'],
    moduleLabel: 'puni-shared-records',
  });
