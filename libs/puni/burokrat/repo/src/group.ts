import { command, map, message, optional, or } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { initParser } from './repo-init.command';
import { upgradeParser } from './repo-upgrade.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['repo'] };

/**
 * The `repo` group, parsed after its name. A bare `repo` yields a request to print the group's
 * help.
 */
export const repoParser = map(
  optional(
    or(
      command('init', initParser, {
        brief: message`Create a governed repository here and its records repository beside it.`,
      }),
      command('upgrade', upgradeParser, {
        brief: message`Raise this repository's rules pin to the latest epoch, if it passes them.`,
      }),
    ),
  ),
  (leaf) => leaf ?? helpRequest,
);
