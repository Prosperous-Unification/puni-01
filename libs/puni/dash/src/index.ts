import { object } from '@optique/core';

/**
 * The Dash leaf commands, parsed after the group name.
 * Dash executes and operates: it does what was decided.
 *
 * It has no leaf commands yet, so it accepts no further token and yields `{}`. Each leaf will
 * live in its own file and this parser becomes `or()` of them.
 */
export const dashParser = object({});
