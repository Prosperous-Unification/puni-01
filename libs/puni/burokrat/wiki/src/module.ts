import { DiBag } from 'di-bag';
import { createWikiMapCommand } from './wiki-map.command';
import { createWikiMapPrinter } from './wiki-map.feature';

/** `puni burokrat wiki map`; the host supplies the checkout resources and the project sources. */
export const burokratWikiModule = DiBag.createBuilder()
  .withServices({ wikiMapPrinter: createWikiMapPrinter })
  .withServices({ burokratWikiMapCommand: createWikiMapCommand })
  .buildModule({
    exportedServiceKeys: ['burokratWikiMapCommand'],
    moduleLabel: 'puni-burokrat-wiki',
  });
