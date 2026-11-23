import { constant } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';

const helpRequest: HelpRequest = { kind: 'help', path: ['progress'] };

/**
 * The `progress` group, parsed after its name. It has no leaves yet, so it accepts only the bare
 * `progress`, a request to print the group's help.
 */
export const progressParser = constant(helpRequest);
