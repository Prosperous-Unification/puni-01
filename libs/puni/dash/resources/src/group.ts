import { command, map, message, optional, or } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { createParser } from './create.command';
import { execParser } from './exec.command';
import { listParser } from './list.command';
import { removeParser } from './remove.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['resources'] };

/**
 * The `resources` group, parsed after its name. A bare `resources` yields a request to print the
 * group's help.
 */
export const resourcesParser = map(
  optional(
    or(
      command('create', createParser, {
        brief: message`Create a disposable worktree of the system-state repository.`,
      }),
      command('list', listParser, {
        brief: message`List the disposable worktrees and whether each is clean.`,
      }),
      command('exec', execParser, {
        brief: message`Run a command in a disposable worktree.`,
      }),
      command('remove', removeParser, {
        brief: message`Remove a disposable worktree and its branch.`,
      }),
    ),
  ),
  (leaf) => leaf ?? helpRequest,
);
