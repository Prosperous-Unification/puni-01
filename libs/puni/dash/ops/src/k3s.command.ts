import { argument, map, message, passThrough, seq, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { K3sRequest, NodeShell } from './contract';
import { exitWithShellOutcome } from './shell-outcome';

/**
 * `k3s KUBECTL_ARGS...`: at least one argument, then every later token, flags included, passed
 * to `k3s kubectl` as given. `k3s --help` prints its help; Optique drops a `--` directly after
 * the first argument, and a first argument starting with `-` needs a leading `--`
 * (`k3s -- -n kube-system get pods`).
 */
export const k3sParser = map(
  seq(
    argument(string({ metavar: 'KUBECTL_ARG' }), {
      description: message`The first argument of kubectl, such as get.`,
    }),
    passThrough({ format: 'greedy', description: message`The rest of kubectl's arguments.` }),
  ),
  ([first, rest]): K3sRequest => ({ kind: 'ops k3s', args: [first, ...rest] }),
);

/**
 * The `ops k3s` command: runs `k3s kubectl` with the arguments on the node holding the role
 * `k3s-server`, attached to this terminal, and returns the remote exit code; see
 * `exitWithShellOutcome` for the rest.
 */
export function createK3sCommand({ nodeShell }: { nodeShell: NodeShell }): Command<K3sRequest> {
  return {
    run: (request, io) => exitWithShellOutcome(nodeShell.runKubectl(io.cwd, request.args), io),
  };
}
