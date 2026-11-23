import { constant } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';

const helpRequest: HelpRequest = { kind: 'help', path: ['resources'] };

/**
 * The `resources` group, parsed after its name. It has no leaves yet, so it accepts only the bare
 * `resources`, a request to print the group's help.
 */
export const resourcesParser = constant(helpRequest);
