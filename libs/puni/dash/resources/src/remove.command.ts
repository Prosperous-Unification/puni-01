import { argument, map, message, object, option, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { RemoveRequest, Resources } from './contract';
import { exitWithResourcesOutcome } from './resources-outcome.command';

/** `remove NAME [--force]`: the resource to remove, and whether to discard what it holds. */
export const removeParser = map(
  object({
    name: argument(string({ metavar: 'NAME' }), { description: message`The resource to remove.` }),
    force: option('--force', {
      description: message`Destructive: discard the worktree's uncommitted changes and the branch's unmerged commits. The only way remove loses work.`,
    }),
  }),
  ({ name, force }): RemoveRequest => ({ kind: 'resources remove', name, force }),
);

/**
 * The `resources remove` command: removes the resource's worktree and its branch, prints
 * `removed <name>` and returns 0. Without `--force`, a worktree with uncommitted changes or a
 * branch holding commits `HEAD` lacks is refused before anything is removed: one `error:` line
 * naming every reason, and 2, as for an unknown resource. A missing checkout or a git failure
 * prints one `error:` line and returns 1.
 */
export function createRemoveCommand({
  resources,
}: {
  resources: Resources;
}): Command<RemoveRequest> {
  return {
    run: (request, io) =>
      exitWithResourcesOutcome(
        resources.remove(io.cwd, request.name, request.force),
        io,
        (removed) => {
          io.stdout(`removed ${removed.name}\n`);
          return 0;
        },
      ),
  };
}
