import { DiBag } from 'di-bag';
import { createRecordsCatalog } from './records.resource';

/** The records resources; they need nothing from the host. */
export const recordsModule = DiBag.createBuilder()
  .withServices({ recordsCatalog: createRecordsCatalog })
  .buildModule({ exportedServiceKeys: ['recordsCatalog'], moduleLabel: 'puni-shared-records' });
