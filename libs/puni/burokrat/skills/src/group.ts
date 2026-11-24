import { command, map, message, optional } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { skillsInstallParser } from './install-skills.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['skills'] };

/** The `skills` subgroup. A bare `skills` yields its help request. */
export const skillsParser = map(
  optional(
    command('install', skillsInstallParser, {
      brief: message`Install the PUNI review skills in this checkout.`,
    }),
  ),
  (leaf) => leaf ?? helpRequest,
);
