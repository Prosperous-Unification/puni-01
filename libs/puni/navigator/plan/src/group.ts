import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { planAddParser } from './plan-add.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['plan'] };

/**
 * The `plan` sub-group, parsed after its name. A bare `plan` yields a request to print the
 * sub-group's help.
 */
export const planParser = map(
  optional(
    command('add', planAddParser, {
      brief: message`File a plan in the records repository.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
