import type { ProcessRunner } from '@puni/shared-ports';
import type { RemoteShellResource } from './contract';
import { quoteForPosixShell } from './nodes';

/** What the remote shell needs from its host. */
export interface RemoteShellRequirements {
  readonly processRunner: ProcessRunner;
}

/**
 * The argument vector of `ssh` for `destination`: `ssh <destination>` for an interactive shell,
 * else `ssh <destination> -- <command>`. SSH joins the words after `--` with spaces for the
 * remote shell, so each is quoted for a POSIX shell and its boundaries survive; `--` keeps a
 * command starting with `-` from being read as an `ssh` option.
 */
export function buildSshArguments(destination: string, command: readonly string[]): string[] {
  if (command.length === 0) return ['ssh', destination];
  return ['ssh', destination, '--', ...command.map(quoteForPosixShell)];
}

/**
 * The {@link RemoteShellResource}: `ssh` run attached through `processRunner`, never through a
 * local shell. A remote shell that is not POSIX, such as fish, may read the quoting otherwise.
 */
export function createRemoteShell({ processRunner }: RemoteShellRequirements): RemoteShellResource {
  return {
    run: (destination, command, cwd) =>
      processRunner.runAttached(buildSshArguments(destination, command), { cwd }),
  };
}
