import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { initParser } from './repo-init.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['repo'] };

/**
 * The `repo` group, parsed after its name. A bare `repo` yields a request to print the group's
 * help.
 */
export const repoParser = map(
  optional(
    command('init', initParser, {
      brief: message`Create a governed repository here and its records repository beside it.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
