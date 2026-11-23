import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { runLogParser } from './run-log.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['run'] };

/**
 * The `run` group, parsed after its name. A bare `run` yields a request to print the group's
 * help.
 */
export const runParser = map(
  optional(
    command('log', runLogParser, {
      brief: message`Record a run's outcome as an assessment in the records repository.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
