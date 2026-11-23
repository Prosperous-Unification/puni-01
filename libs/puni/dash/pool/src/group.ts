import { constant } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';

const helpRequest: HelpRequest = { kind: 'help', path: ['pool'] };

/**
 * The `pool` group, parsed after its name. It has no leaves yet, so it accepts only the bare
 * `pool`, a request to print the group's help.
 */
export const poolParser = constant(helpRequest);
