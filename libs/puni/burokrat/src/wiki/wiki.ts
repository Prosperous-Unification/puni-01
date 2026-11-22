import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '../help-request';
import { wikiIndexParser } from './wiki-index';

const helpRequest: HelpRequest = { kind: 'help', path: ['wiki'] };

/**
 * The `wiki` sub-group, parsed after its name. A bare `wiki` yields a request to print the
 * sub-group's help.
 */
export const wikiParser = map(
  optional(
    command('index', wikiIndexParser, {
      brief: message`Write the generated wiki index.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
