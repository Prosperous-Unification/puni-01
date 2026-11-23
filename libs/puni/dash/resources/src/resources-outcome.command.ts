import type { CommandExitCode, Io } from '@puni/shared-command';
import type { ResourcesOutcome } from './contract';

/**
 * The exit code of a resources command that ended as `outcome`: what `succeed` returns for its
 * result; else one `error:` line on `stderr` and 2 for a refused command line, 1 for a failed
 * repository or git.
 */
export function exitWithResourcesOutcome<Done>(
  outcome: ResourcesOutcome<Done>,
  io: Io,
  succeed: (done: Done) => CommandExitCode,
): CommandExitCode {
  switch (outcome.kind) {
    case 'done':
      return succeed(outcome.done);
    case 'refused':
      io.stderr(`error: ${outcome.reason}\n`);
      return 2;
    case 'failed':
      io.stderr(`error: ${outcome.reason}\n`);
      return 1;
  }
}
