import { type BurokratRequest, runWikiIndex } from '@puni/burokrat';
import { listCommands, printHelp, type PuniCommand } from './cli-parser';

/** What a command may touch outside its arguments. */
export interface CommandContext {
  /** The directory commands that look for the repository start from. */
  readonly cwd: string;
  readonly stdout: (text: string) => void;
}

/**
 * Runs one parsed `puni` command and returns its exit code: 0 on success, 1 when a judgement
 * failed. A bare group or sub-group prints its own help.
 *
 * @throws Error from a command whose trusted input is missing or invalid.
 */
export function runCommand(command: PuniCommand, context: CommandContext): 0 | 1 {
  switch (command.group) {
    case 'navigator':
    case 'dash':
      printHelp([command.group], context.stdout);
      return 0;
    case 'burokrat':
      return runBurokrat(command.request, context);
  }
}

function runBurokrat(request: BurokratRequest, context: CommandContext): 0 | 1 {
  switch (request.kind) {
    case 'help':
      printHelp(['burokrat', ...request.path], context.stdout);
      return 0;
    case 'wiki index':
      return runWikiIndex(request, { ...context, commands: listCommands() });
  }
}
