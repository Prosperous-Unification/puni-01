import { argument, constant, message, object, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { WikiMapPrinter, WikiMapRequest } from './contract';

/** `wiki map [PARTITION]`: prints the root of the map, or one wiki section or partition of it. */
export const wikiMapParser = object({
  kind: constant('wiki map'),
  partition: optional(
    argument(string({ metavar: 'PARTITION' }), {
      description: message`The wiki section or partition to print, as the root of the map names it (concepts, dash/ops).`,
    }),
  ),
});

/**
 * The `wiki map` command: prints the map's text to `stdout` and returns 0, writing nothing. An
 * argument naming no section or partition the map shows, the empty one included, prints one
 * `error: ` line naming every one it does and returns 2: the command line names something the repository does not have. A repository whose
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
          const list = (names: readonly string[]) =>
            names.length === 0 ? 'none' : names.join(', ');
          io.stderr(
            `error: the map has no section or partition ${JSON.stringify(outcome.argument)}; its sections: ${list(outcome.sections)}; its partitions: ${list(outcome.partitions)}\n`,
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
