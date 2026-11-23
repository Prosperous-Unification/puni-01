import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { outcomesParser } from './outcomes.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['assess'] };

/**
 * The `assess` group, parsed after its name. A bare `assess` yields a request to print the
 * group's help.
 */
export const assessParser = map(
  optional(
    command('outcomes', outcomesParser, {
      brief: message`Say what the agent work of a period cost per accepted outcome.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
