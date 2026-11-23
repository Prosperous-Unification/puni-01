import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { adrAddParser } from './adr-add.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['adr'] };

/**
 * The `adr` group, parsed after its name. A bare `adr` yields a request to print the group's
 * help.
 */
export const adrParser = map(
  optional(
    command('add', adrAddParser, {
      brief: message`File an architecture decision record in the records repository.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
