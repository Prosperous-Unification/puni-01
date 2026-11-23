import { constant, object } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { ListRequest, Resources } from './contract';
import { exitWithResourcesOutcome } from './resources-outcome.command';

/** `list`, which takes no options. */
export const listParser = object({ kind: constant('resources list') });

/**
 * The `resources list` command: prints one line per resource, `<name> <branch> clean|dirty`,
 * sorted by name, nothing when there are none, and returns 0. A missing checkout or a git failure
 * prints one `error:` line and returns 1.
 */
export function createListCommand({ resources }: { resources: Resources }): Command<ListRequest> {
  return {
    run: (_request, io) =>
      exitWithResourcesOutcome(resources.list(io.cwd), io, (listed) => {
        for (const { name, branch, clean } of listed) {
          io.stdout(`${name} ${branch} ${clean ? 'clean' : 'dirty'}\n`);
        }
        return 0;
      }),
  };
}
