import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { wikiMapParser } from './wiki-map.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['wiki'] };

/**
 * The `wiki` sub-group, parsed after its name. A bare `wiki` yields a request to print the
 * sub-group's help.
 */
export const wikiParser = map(
  optional(
    command('map', wikiMapParser, {
      brief: message`Print the map from a task to the file to read first.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
