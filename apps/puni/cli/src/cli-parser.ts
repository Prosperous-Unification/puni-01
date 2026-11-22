import {
  command,
  constant,
  formatMessage,
  getDocPageSync,
  type InferValue,
  message,
  object,
  or,
} from '@optique/core';
import { run } from '@optique/run';
import { burokratParser, type CommandBrief } from '@puni/burokrat';
import { dashParser } from '@puni/dash';
import { navigatorParser } from '@puni/navigator';
import cliPackage from '../package.json' with { type: 'json' };

const programName = 'puni';

/**
 * A refused command line: unknown group, unexpected token or unknown flag. Its message is one
 * line; the entrypoint prints it after `error: ` and exits 2.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/**
 * Every `puni` command line: one `command` per role group. Aliases select their group at runtime
 * and in completion but never appear in usage or help, which name only the canonical group. A new
 * group also needs a case in `runCommand` in `cli.ts`, which runs each parsed command and returns
 * its exit code, 0 or 1.
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

/** What one invocation did: a command to run, or help, version or a completion script printed. */
export type Invocation =
  { readonly kind: 'command'; readonly command: PuniCommand } | { readonly kind: 'printed' };

/**
 * The one-line reason inside Optique's error text: the text after its last `Error: `, cut before
 * any help page that follows it, with wrapped lines joined.
 */
function readReason(errorText: string): string {
  const marker = errorText.lastIndexOf('Error: ');
  const reason = marker < 0 ? errorText : errorText.slice(marker + 'Error: '.length);
  const helpStart = reason.indexOf('\nUsage:');
  return (helpStart < 0 ? reason : reason.slice(0, helpStart))
    .split(/\s+/u)
    .join(' ')
    .replace(/ (?=[.,]$)/u, '')
    .trim();
}

/** The exit `run` takes after printing help, version or completion; caught, never escapes. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parses one `puni` command line. Help, version and completion scripts go to `stdout` and return
 * `{ kind: 'printed' }`. Never calls `process.exit`, and never reads terminal width or colour.
 *
 * @throws UsageRefusal with a one-line reason; nothing is written to `stdout` or `stderr`.
 */
export function readInvocation(
  args: readonly string[],
  stdout: (text: string) => void,
): Invocation {
  let errorText = '';
  try {
    const parsed = run(puniParser, {
      programName,
      args: args.length === 0 ? ['--help'] : args,
      stdout,
      stderr: (chunk) => {
        errorText += chunk;
      },
      onExit: (code) => {
        throw code === 0 ? new Printed() : new UsageRefusal(readReason(errorText));
      },
      colors: false,
      maxWidth: 100,
      aboveError: 'none',
      help: 'both',
      version: { value: cliPackage.version, option: true },
      completion: 'command',
    });
    return { kind: 'command', command: parsed };
  } catch (cause) {
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}

/**
 * Prints the help page of one group or sub-group to `stdout`, exactly as
 * `puni <path...> --help` does.
 *
 * @throws Error if Optique parses `<path...> --help` as a command instead of printing help.
 */
export function printHelp(path: readonly string[], stdout: (text: string) => void): void {
  const invocation = readInvocation([...path, '--help'], stdout);
  if (invocation.kind !== 'printed') throw new Error(`${path.join(' ')} --help did not print help`);
}

/**
 * Every group and leaf of the `puni` tree, read from the doc pages of {@link puniParser}: each
 * command entry on the page at a path is a child, visited in turn. Paths use canonical names;
 * help and completion, which the runner adds, are not part of the tree.
 *
 * @throws Error when a page cannot be built or a command has no brief.
 */
export function listCommands(): CommandBrief[] {
  const commands: CommandBrief[] = [];
  const visit = (path: readonly string[]): void => {
    const page = getDocPageSync(puniParser, path);
    if (page === undefined) throw new Error(`no doc page for ${[programName, ...path].join(' ')}`);
    for (const entry of page.sections.flatMap((section) => section.entries)) {
      if (entry.term.type !== 'command') continue;
      const childPath = [...path, entry.term.name];
      const fullPath = [programName, ...childPath].join(' ');
      if (entry.description === undefined) throw new Error(`${fullPath} has no brief`);
      commands.push({ path: fullPath, brief: formatMessage(entry.description, { colors: false }) });
      visit(childPath);
    }
  };
  visit([]);
  return commands;
}
