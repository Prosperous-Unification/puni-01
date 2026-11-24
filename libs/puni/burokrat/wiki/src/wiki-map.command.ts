import { argument, constant, message, object, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { WikiMapPrinter, WikiMapRequest } from './contract';

/** `wiki map [PARTITION]`: prints the root of the map, or one partition of it. */
export const wikiMapParser = object({
  kind: constant('wiki map'),
  partition: optional(
    argument(string({ metavar: 'PARTITION' }), {
      description: message`The partition to print, as the root of the map names it (dash, dash/ops).`,
    }),
  ),
});

/**
 * The `wiki map` command: prints the map's text to `stdout` and returns 0, writing nothing. A
 * partition the map does not show prints one `error: ` line naming every partition it does and
 * returns 2: the command line names something the repository does not have. A repository whose
 * map cannot be printed prints one `error: ` line to `stderr` and returns 1.
 */
export function createWikiMapCommand({
  wikiMapPrinter,
}: {
  wikiMapPrinter: WikiMapPrinter;
}): Command<WikiMapRequest> {
  return {
    run(request, io) {
      const outcome = wikiMapPrinter.print(io.cwd, request.partition);
      switch (outcome.kind) {
        case 'printed':
          io.stdout(outcome.text);
          return 0;
        case 'unknown': {
          const known = outcome.partitions.length === 0 ? 'none' : outcome.partitions.join(', ');
          io.stderr(
            `error: the map has no partition ${outcome.partition}; its partitions: ${known}\n`,
          );
          return 2;
        }
        case 'refused':
          io.stderr(`error: ${outcome.reason}\n`);
          return 1;
      }
    },
  };
}
