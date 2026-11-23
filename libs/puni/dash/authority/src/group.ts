import { constant } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';

const helpRequest: HelpRequest = { kind: 'help', path: ['authority'] };

/**
 * The `authority` group, parsed after its name. It has no leaves yet, so it accepts only the bare
 * `authority`, a request to print the group's help.
 */
export const authorityParser = constant(helpRequest);
