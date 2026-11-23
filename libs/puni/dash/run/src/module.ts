import { DiBag } from 'di-bag';
import { createRunLogCommand } from './run-log.command';

/** `puni dash run log`; the records module supplies the record filing. */
export const dashRunModule = DiBag.createBuilder()
  .withServices({ dashRunLogCommand: createRunLogCommand })
  .buildModule({
    exportedServiceKeys: ['dashRunLogCommand'],
    moduleLabel: 'puni-dash-run',
  });
