import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { researchAddParser } from './research-add.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['research'] };

/**
 * The `research` group, parsed after its name. A bare `research` yields a request to print the group's
 * help.
 */
export const researchParser = map(
  optional(
    command('add', researchAddParser, {
      brief: message`File research in the records repository.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
