import { command, map, message, optional, or } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { reviewFileParser } from './file.command';
import { reviewNextParser } from './next.command';
import { reviewStartParser } from './start.command';
import { reviewSubmitParser } from './submit.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['review'] };

/** The review commands; a bare group requests its help. */
export const reviewParser = map(
  optional(
    or(
      command('start', reviewStartParser, {
        brief: message`Start a findings or assessment review.`,
      }),
      command('next', reviewNextParser, { brief: message`Read the current review task.` }),
      command('submit', reviewSubmitParser, {
        brief: message`Submit the result of the current review task.`,
      }),
      command('file', reviewFileParser, {
        brief: message`File and print the completed review by impact.`,
      }),
    ),
  ),
  (leaf) => leaf ?? helpRequest,
);
