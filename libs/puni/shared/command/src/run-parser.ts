import { run } from '@optique/run';
import { UsageRefused } from './failures';
import type { CliProgram } from './program';

/** What one invocation did: a parsed command to run, or help, version or a completion printed. */
export type Invocation<Value> =
  { readonly kind: 'command'; readonly command: Value } | { readonly kind: 'printed' };

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

/** The exit Optique takes after printing help, version or completion; caught, never escapes. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parses one command line of `program`; no arguments mean `--help`. Help, version and completion
 * scripts go to `stdout` and return `{ kind: 'printed' }`. Never exits the process, and never
 * reads terminal width or colour.
 *
 * @throws UsageRefused with a one-line reason; nothing is written to `stdout`.
 */
export function readInvocation<Value>(
  program: CliProgram<Value>,
  args: readonly string[],
  stdout: (text: string) => void,
): Invocation<Value> {
  let errorText = '';
  try {
    const parsed = run(program.parser, {
      programName: program.name,
      args: args.length === 0 ? ['--help'] : args,
      stdout,
      stderr: (chunk) => {
        errorText += chunk;
      },
      onExit: (code) => {
        throw code === 0
          ? new Printed()
          : new UsageRefused({ details: { reason: readReason(errorText) } });
      },
      colors: false,
      maxWidth: 100,
      aboveError: 'none',
      help: 'both',
      version: { value: program.version, option: true },
      completion: 'command',
    });
    return { kind: 'command', command: parsed };
  } catch (cause) {
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}

/**
 * Prints the help page of one group or sub-group of `program` to `stdout`, exactly as
 * `<name> <path...> --help` does.
 *
 * @throws Error if Optique parses `<path...> --help` as a command instead of printing help.
 */
export function printHelp<Value>(
  program: CliProgram<Value>,
  path: readonly string[],
  stdout: (text: string) => void,
): void {
  const invocation = readInvocation(program, [...path, '--help'], stdout);
  if (invocation.kind !== 'printed') throw new Error(`${path.join(' ')} --help did not print help`);
}
