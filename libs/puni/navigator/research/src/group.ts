import { constant } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';

const helpRequest: HelpRequest = { kind: 'help', path: ['research'] };

/**
 * The `research` group, parsed after its name. It has no leaves yet, so it accepts only the bare
 * `research`, a request to print the group's help.
 */
export const researchParser = constant(helpRequest);
