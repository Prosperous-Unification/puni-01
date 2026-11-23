import { map, message, object, option, string, withDefault } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { CreateRequest, Resources } from './contract';
import { exitWithResourcesOutcome } from './resources-outcome.command';

/** `create --name NAME [--from REF]`: the resource to create and the commit it starts at. */
export const createParser = map(
  object({
    name: option('--name', string({ metavar: 'NAME' }), {
      description: message`The resource's name: lower-case letters and digits joined by single hyphens.`,
    }),
    from: withDefault(option('--from', string({ metavar: 'REF' })), 'HEAD', {
      message: message`HEAD`,
    }),
  }),
  ({ name, from }): CreateRequest => ({ kind: 'resources create', name, from }),
);

/**
 * The `resources create` command: adds the worktree `.worktrees/NAME` of the system-state
 * repository's main worktree on a new branch `resources/NAME` from REF, prints its path and
 * returns 0. A refused or taken name, or branch, prints one `error:` line and returns 2; a
 * missing checkout or a git failure, an unknown REF included, one `error:` line and 1.
 */
export function createCreateCommand({
  resources,
}: {
  resources: Resources;
}): Command<CreateRequest> {
  return {
    run: (request, io) =>
      exitWithResourcesOutcome(resources.create(io.cwd, request.name, request.from), io, (made) => {
        io.stdout(`${made.path}\n`);
        return 0;
      }),
  };
}
