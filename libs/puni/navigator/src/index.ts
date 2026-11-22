import { object } from '@optique/core';

/**
 * The Navigator leaf commands, parsed after the group name.
 * Navigator plans: it decides what to do.
 *
 * It has no leaf commands, so it accepts no further token and yields `{}`. A group with leaves
 * has the shape of `burokratParser` in `libs/puni/burokrat/src/index.ts`: one file per leaf, and
 * a bare group that yields a help request. Its case in `runCommand` in
 * `apps/puni/cli/src/cli.ts` then runs the leaf instead of printing help.
 */
export const navigatorParser = object({});
