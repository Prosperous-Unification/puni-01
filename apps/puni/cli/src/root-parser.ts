import {
  command,
  constant,
  type InferValue,
  map,
  message,
  object,
  optional,
  or,
} from '@optique/core';
import { checkParser } from '@puni/burokrat-check';
import { wikiParser } from '@puni/burokrat-wiki';
import type { CliProgram, HelpRequest } from '@puni/shared-command';
import cliPackage from '../package.json' with { type: 'json' };

const burokratHelp: HelpRequest = { kind: 'help', path: [] };

/**
 * The Burokrat leaf commands, parsed after the group name. Burokrat holds the rules: it judges
 * whether work was done right.
 *
 * A bare group or sub-group yields `{ kind: 'help', path }`, the sub-group path below `burokrat`
 * whose help is printed; a leaf yields its own `kind`. The group level uses `optional` rather
 * than `or` with an empty branch because Optique's help drops the brackets of an `or` whose empty
 * branch is not taken, printing a usage line that hides the bare form.
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
  (leaf) => leaf ?? burokratHelp,
);

/**
 * The leaf commands of a role group without a library: none, so the group accepts no further
 * token, yields `{}` and prints its help. A group with leaves has the shape of
 * {@link burokratParser}: its library exports each leaf's parser and a bare group yields a help
 * request.
 */
export const emptyGroupParser = object({});

/**
 * Every `puni` command line: one `command` per role group. Navigator plans: it decides what to
 * do. Dash executes and operates: it does what was decided. Aliases select their group at
 * runtime and in completion but never appear in usage or help, which name only the canonical
 * group. A new leaf also needs an entry in {@link handlerKeys} and a case in `runPuni` in
 * `main.ts`.
 */
export const puniParser = or(
  command('navigator', object({ group: constant('navigator'), request: emptyGroupParser }), {
    aliases: ['nav', 'n'],
    brief: message`Plan: decide what to do.`,
  }),
  command('dash', object({ group: constant('dash'), request: emptyGroupParser }), {
    aliases: ['d'],
    brief: message`Execute and operate: do it.`,
  }),
  command('burokrat', object({ group: constant('burokrat'), request: burokratParser }), {
    aliases: ['bur', 'b'],
    brief: message`Judge: decide whether it was done right.`,
  }),
);

/** A parsed `puni` command line, discriminated by its canonical `group`. */
export type PuniCommand = InferValue<typeof puniParser>;

/** A canonical group name. */
export type Group = PuniCommand['group'];

/** The `puni` program: its parser, name and version. */
export const puniProgram: CliProgram<PuniCommand> = {
  parser: puniParser,
  name: 'puni',
  version: cliPackage.version,
};

type BurokratRequest = Extract<PuniCommand, { group: 'burokrat' }>['request'];

/** A parsed command reduced to the one thing to do: print a help page, or run one leaf. */
export type Leaf =
  | HelpRequest
  | {
      readonly kind: 'burokrat check';
      readonly request: Extract<BurokratRequest, { kind: 'check' }>;
    }
  | {
      readonly kind: 'burokrat wiki index';
      readonly request: Extract<BurokratRequest, { kind: 'wiki index' }>;
    };

/** The container key of the command service that runs each leaf kind. */
export const handlerKeys = {
  'burokrat check': 'burokratCheckCommand',
  'burokrat wiki index': 'burokratWikiIndexCommand',
} as const satisfies Record<Exclude<Leaf['kind'], 'help'>, string>;

/** The leaf `command` names; a bare group or sub-group is the help of its full path. */
export function selectLeaf(command: PuniCommand): Leaf {
  switch (command.group) {
    case 'navigator':
    case 'dash':
      return { kind: 'help', path: [command.group] };
    case 'burokrat': {
      const { request } = command;
      switch (request.kind) {
        case 'help':
          return { kind: 'help', path: ['burokrat', ...request.path] };
        case 'check':
          return { kind: 'burokrat check', request };
        case 'wiki index':
          return { kind: 'burokrat wiki index', request };
      }
    }
  }
}
