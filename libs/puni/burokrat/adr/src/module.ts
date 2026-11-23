import { DiBag } from 'di-bag';
import { createAdrAddCommand } from './adr-add.command';

/** `puni burokrat adr add`; the records module supplies the record filing. */
export const burokratAdrModule = DiBag.createBuilder()
  .withServices({ burokratAdrAddCommand: createAdrAddCommand })
  .buildModule({
    exportedServiceKeys: ['burokratAdrAddCommand'],
    moduleLabel: 'puni-burokrat-adr',
  });
