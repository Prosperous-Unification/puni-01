import type { CommandExitCode, Io } from '@puni/shared-command';
import type { NodeShellOutcome } from './contract';

/**
 * The exit code of a pass-through command whose node shell ended as `outcome`: the remote exit
 * code unchanged once `ssh` ran; else one `error:` line on `stderr` and 2 for a refused command
 * line, 1 for a defective records repository or an `ssh` that could not start.
 */
export function exitWithShellOutcome(outcome: NodeShellOutcome, io: Io): CommandExitCode {
  switch (outcome.kind) {
    case 'exited':
      return outcome.exitCode;
    case 'unstarted':
      io.stderr(`error: ssh could not start: ${outcome.reason}\n`);
      return 1;
    case 'refused':
      io.stderr(`error: ${outcome.reason}\n`);
      return 2;
    case 'defective':
      io.stderr(`error: ${outcome.reason}\n`);
      return 1;
  }
}
