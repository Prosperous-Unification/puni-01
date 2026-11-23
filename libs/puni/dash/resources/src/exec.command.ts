import { argument, map, message, passThrough, seq, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { ExecRequest, Resources } from './contract';
import { exitWithResourcesOutcome } from './resources-outcome.command';

/**
 * `exec NAME COMMAND...`: the resource, then every later token, flags included, as the command;
 * a `--` directly after the name is dropped, so `exec NAME -- COMMAND...` passes a command
 * starting with `-`.
 */
export const execParser = map(
  seq(
    argument(string({ metavar: 'NAME' }), { description: message`The resource to run in.` }),
    passThrough({
      format: 'greedy',
      description: message`The command to run, with its arguments.`,
    }),
  ),
  ([name, command]): ExecRequest => ({ kind: 'resources exec', name, command }),
);

/**
 * The `resources exec` command: runs the command in the resource's worktree attached to this
 * terminal, never through a shell, and returns its exit code once it started. An unknown
 * resource or no command prints one `error:` line and returns 2; a command that cannot start, a
 * missing checkout or a git failure one `error:` line and 1.
 */
export function createExecCommand({ resources }: { resources: Resources }): Command<ExecRequest> {
  return {
    run: (request, io) =>
      exitWithResourcesOutcome(resources.exec(io.cwd, request.name, request.command), io, (ran) => {
        if (ran.kind === 'exited') return ran.exitCode;
        io.stderr(`error: ${request.command[0] ?? ''} could not start: ${ran.reason}\n`);
        return 1;
      }),
  };
}
