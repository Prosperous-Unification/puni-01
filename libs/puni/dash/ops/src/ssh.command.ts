import { argument, map, message, passThrough, seq, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { NodeShell, SshRequest } from './contract';
import { exitWithShellOutcome } from './shell-outcome.command';

/**
 * `ssh NODE [COMMAND...]`: the node, then every later token, flags included, as the command; a
 * `--` directly after the node is dropped, so `ssh NODE -- COMMAND...` passes a command starting
 * with `-`. `ssh --help` prints its help; after the node, `--help` belongs to the command.
 */
export const sshParser = map(
  seq(
    argument(string({ metavar: 'NODE' }), {
      description: message`The node, by its name in the records repository's dash/ops/nodes.json.`,
    }),
    passThrough({
      format: 'greedy',
      description: message`The command to run on the node; with none, an interactive shell.`,
    }),
  ),
  ([node, command]): SshRequest => ({ kind: 'ops ssh', node, command }),
);

/**
 * The `ops ssh` command: runs the command on the node, or opens a shell there, attached to this
 * terminal, and returns the remote exit code; see `exitWithShellOutcome` for the rest.
 */
export function createSshCommand({ nodeShell }: { nodeShell: NodeShell }): Command<SshRequest> {
  return {
    run: (request, io) =>
      exitWithShellOutcome(nodeShell.open(io.cwd, request.node, request.command), io),
  };
}
