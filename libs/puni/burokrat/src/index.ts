import { command, type InferValue, map, message, optional, or } from '@optique/core';
import { checkParser } from './check/check';
import type { HelpRequest } from './help-request';
import { wikiParser } from './wiki/wiki';

export type { HelpRequest } from './help-request';
export { type CheckContext, runCheck } from './check/check';
export { type CommandBrief, runWikiIndex, type WikiIndexContext } from './wiki/wiki-index';

const helpRequest: HelpRequest = { kind: 'help', path: [] };

/**
 * The Burokrat leaf commands, parsed after the group name.
 * Burokrat holds the rules: it judges whether work was done right.
 *
 * A bare group or sub-group yields `{ kind: 'help', path }`, the sub-group path below
 * `burokrat` whose help the app prints; a leaf yields its own `kind`. The group level uses
 * `optional` rather than `or` with an empty branch because Optique's help drops the brackets
 * of an `or` whose empty branch is not taken, printing a usage line that hides the bare form.
 */
export const burokratParser = map(
  optional(
    or(
      command('check', checkParser, {
        brief: message`Judge the repository against its rules.`,
      }),
      command('wiki', wikiParser, { brief: message`Generate the wiki index.` }),
    ),
  ),
  (leaf) => leaf ?? helpRequest,
);

/** A parsed Burokrat request, discriminated by `kind`. */
export type BurokratRequest = InferValue<typeof burokratParser>;
