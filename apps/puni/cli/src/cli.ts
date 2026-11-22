import { printGroupHelp, type PuniCommand } from './cli-parser';

/**
 * Runs one parsed `puni` command and returns its exit code: 0 on success, 1 when a judgement
 * failed. No group has leaf commands yet, so every group is bare and prints its own help.
 */
export function runCommand(command: PuniCommand, stdout: (text: string) => void): 0 | 1 {
  switch (command.group) {
    case 'navigator':
    case 'dash':
    case 'burokrat':
      printGroupHelp(command.group, stdout);
      return 0;
  }
}
