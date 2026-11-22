import { DiBag } from 'di-bag';
import { createWikiIndexCommand } from './wiki-index.command';
import { createWikiIndexWriter } from './wiki-index.feature';

/** `puni burokrat wiki index`; the host supplies the checkout resources and the command catalog. */
export const burokratWikiModule = DiBag.createBuilder()
  .withServices({ wikiIndexWriter: createWikiIndexWriter })
  .withServices({ burokratWikiIndexCommand: createWikiIndexCommand })
  .buildModule({
    exportedServiceKeys: ['burokratWikiIndexCommand'],
    moduleLabel: 'puni-burokrat-wiki',
  });
