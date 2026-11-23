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
import { adrParser } from '@puni/burokrat-adr';
import { assessParser } from '@puni/burokrat-assess';
import { changeParser } from '@puni/burokrat-change';
import { checkParser } from '@puni/burokrat-check';
import { repoParser } from '@puni/burokrat-repo';
import { wikiParser } from '@puni/burokrat-wiki';
import { admissionParser } from '@puni/dash-admission';
import { authorityParser } from '@puni/dash-authority';
import { mcpParser } from '@puni/dash-mcp';
import { opsParser } from '@puni/dash-ops';
import { poolParser } from '@puni/dash-pool';
import { progressParser as dashProgressParser } from '@puni/dash-progress';
import { releaseParser } from '@puni/dash-release';
import { resourcesParser } from '@puni/dash-resources';
import { runParser } from '@puni/dash-run';
import { planParser } from '@puni/navigator-plan';
import { progressParser as navigatorProgressParser } from '@puni/navigator-progress';
import { researchParser } from '@puni/navigator-research';
import type { CliProgram, HelpRequest } from '@puni/shared-command';
import cliPackage from '../package.json' with { type: 'json' };

const groupHelp: HelpRequest = { kind: 'help', path: [] };

/**
 * The Navigator leaf commands, parsed after the group name. Navigator plans: it decides what to
 * do. A bare group or sub-group yields a help request, as in {@link burokratParser}.
 */
export const navigatorParser = map(
  optional(
    or(
      command('plan', planParser, { brief: message`File plans in the records repository.` }),
      command('research', researchParser, {
        brief: message`File research in the records repository.`,
      }),
      command('progress', navigatorProgressParser, {
        brief: message`Admit progress receipts and turn them into WBS commands.`,
      }),
    ),
  ),
  (leaf) => leaf ?? groupHelp,
);

/**
 * The Dash leaf commands, parsed after the group name. Dash executes and operates: it does what
 * was decided. A bare group or sub-group yields a help request, as in {@link burokratParser}.
 */
export const dashParser = map(
  optional(
    or(
      command('ops', opsParser, { brief: message`Reach the nodes of the inventory.` }),
      command('run', runParser, { brief: message`Run commands and log each run.` }),
      command('progress', dashProgressParser, {
        brief: message`Record operator progress as receipts.`,
      }),
      command('resources', resourcesParser, {
        brief: message`Manage disposable directories and worktrees, and the commands run in them.`,
      }),
      command('release', releaseParser, { brief: message`Plan and run releases of a product.` }),
      command('admission', admissionParser, {
        brief: message`Submit candidates for admission and run their checks.`,
      }),
      command('authority', authorityParser, {
        brief: message`Create, inspect and repair the authority of a repository.`,
      }),
      command('mcp', mcpParser, { brief: message`Issue credentials for the WBS MCP server.` }),
      command('pool', poolParser, { brief: message`Store the keys of agent pools.` }),
    ),
  ),
  (leaf) => leaf ?? groupHelp,
);

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
      command('repo', repoParser, { brief: message`Set up repositories for puni to govern.` }),
      command('adr', adrParser, { brief: message`File architecture decision records.` }),
      command('change', changeParser, { brief: message`Archive finished changes.` }),
      command('assess', assessParser, {
        brief: message`Assess the outcomes of work and what they cost.`,
      }),
    ),
  ),
  (leaf) => leaf ?? groupHelp,
);

/**
 * Every `puni` command line: one `command` per role group. A new command goes to the role its
 * result belongs to: Navigator decides (its result is a decision about what to do), Dash does
 * (an effect on the system or a node), Burokrat judges (a verdict on whether work was done
 * right). A command whose result is two of these is two commands. Aliases select their group at
 * runtime and in completion but never appear in usage or help, which name only the canonical
 * group. A new leaf also needs an entry in {@link handlerKeys} and a case in `runPuni` in
 * `main.ts`.
 */
export const puniParser = or(
  command('navigator', object({ group: constant('navigator'), request: navigatorParser }), {
    aliases: ['nav', 'n'],
    brief: message`Plan: decide what to do.`,
  }),
  command('dash', object({ group: constant('dash'), request: dashParser }), {
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

type GroupRequest<Name extends Group> = Extract<PuniCommand, { group: Name }>['request'];
type BurokratRequest = GroupRequest<'burokrat'>;
type DashRequest = GroupRequest<'dash'>;
type NavigatorRequest = GroupRequest<'navigator'>;

/** A parsed command reduced to the one thing to do: print a help page, or run one leaf. */
export type Leaf =
  | HelpRequest
  | {
      readonly kind: 'navigator plan add';
      readonly request: Extract<NavigatorRequest, { kind: 'plan add' }>;
    }
  | {
      readonly kind: 'dash ops ssh';
      readonly request: Extract<DashRequest, { kind: 'ops ssh' }>;
    }
  | {
      readonly kind: 'dash ops k3s';
      readonly request: Extract<DashRequest, { kind: 'ops k3s' }>;
    }
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
  'navigator plan add': 'navigatorPlanAddCommand',
  'dash ops ssh': 'dashOpsSshCommand',
  'dash ops k3s': 'dashOpsK3sCommand',
  'burokrat check': 'burokratCheckCommand',
  'burokrat wiki index': 'burokratWikiIndexCommand',
} as const satisfies Record<Exclude<Leaf['kind'], 'help'>, string>;

function selectNavigatorLeaf(request: NavigatorRequest): Leaf {
  switch (request.kind) {
    case 'help':
      return { kind: 'help', path: ['navigator', ...request.path] };
    case 'plan add':
      return { kind: 'navigator plan add', request };
  }
}

function selectDashLeaf(request: DashRequest): Leaf {
  switch (request.kind) {
    case 'help':
      return { kind: 'help', path: ['dash', ...request.path] };
    case 'ops ssh':
      return { kind: 'dash ops ssh', request };
    case 'ops k3s':
      return { kind: 'dash ops k3s', request };
  }
}

function selectBurokratLeaf(request: BurokratRequest): Leaf {
  switch (request.kind) {
    case 'help':
      return { kind: 'help', path: ['burokrat', ...request.path] };
    case 'check':
      return { kind: 'burokrat check', request };
    case 'wiki index':
      return { kind: 'burokrat wiki index', request };
  }
}

/** The leaf `command` names; a bare group or sub-group is the help of its full path. */
export function selectLeaf(command: PuniCommand): Leaf {
  switch (command.group) {
    case 'navigator':
      return selectNavigatorLeaf(command.request);
    case 'dash':
      return selectDashLeaf(command.request);
    case 'burokrat':
      return selectBurokratLeaf(command.request);
  }
}
