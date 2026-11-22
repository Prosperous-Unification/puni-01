import { command, map, message, optional, or } from '@optique/core';
import type { HelpRequest } from '@puni/shared-command';
import { k3sParser } from './k3s.command';
import { sshParser } from './ssh.command';

const helpRequest: HelpRequest = { kind: 'help', path: ['ops'] };

/**
 * The `ops` sub-group, parsed after its name. A bare `ops` yields a request to print the
 * sub-group's help.
 */
export const opsParser = map(
  optional(
    or(
      command('ssh', sshParser, {
        brief: message`Open a shell on a node, or run a command there.`,
      }),
      command('k3s', k3sParser, {
        brief: message`Run kubectl on the node that runs the k3s server.`,
      }),
    ),
  ),
  (leaf) => leaf ?? helpRequest,
);
