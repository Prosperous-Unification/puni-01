import { command, type InferValue, map, message, optional } from '@optique/core';
import type { HelpRequest } from './help-request';
import { wikiParser } from './wiki/wiki';

export type { HelpRequest } from './help-request';
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
  optional(command('wiki', wikiParser, { brief: message`Generate and judge the wiki index.` })),
  (wiki) => wiki ?? helpRequest,
);

/** A parsed Burokrat request, discriminated by `kind`. */
export type BurokratRequest = InferValue<typeof burokratParser>;
