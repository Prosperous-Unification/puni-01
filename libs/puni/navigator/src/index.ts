import { object } from '@optique/core';

/**
 * The Navigator leaf commands, parsed after the group name.
 * Navigator plans: it decides what to do.
 *
 * It has no leaf commands yet, so it accepts no further token and yields `{}`. Each leaf will
 * live in its own file and this parser becomes `or()` of them.
 */
export const navigatorParser = object({});
