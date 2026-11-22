import { object } from '@optique/core';

/**
 * The Burokrat leaf commands, parsed after the group name.
 * Burokrat holds the rules: it judges whether work was done right.
 *
 * It has no leaf commands yet, so it accepts no further token and yields `{}`. Each leaf will
 * live in its own file and this parser becomes `or()` of them.
 */
export const burokratParser = object({});
