import { constant, message, object, option } from '@optique/core';
import type { Command } from '@puni/shared-command';
import { indexDirectory } from '@puni/shared-checkout';
import type { WikiIndexRequest, WikiIndexWriter } from './contract';

/**
 * `wiki index [--print]`: rewrites `wiki/index/` from the repository's projects, pages and
 * commands, or prints what it would hold.
 */
export const wikiIndexParser = object({
  kind: constant('wiki index'),
  print: option('--print', {
    description: message`Print the index as one JSON object, path to content; write nothing.`,
  }),
});

/**
 * The `wiki index` command: prints each `wrote:` and `removed:` path, or that the index is
 * current, and returns 0. With `print` it writes nothing and prints one JSON object mapping each
 * path of `wiki/index/` to its content, the input of the Nx sync generator. A refusal prints one
 * `error: ` line to `stderr` and returns 1.
 */
export function createWikiIndexCommand({
  wikiIndexWriter,
}: {
  wikiIndexWriter: WikiIndexWriter;
}): Command<WikiIndexRequest> {
  return {
    run(request, io) {
      if (request.print === true) {
        const rendering = wikiIndexWriter.render(io.cwd);
        if (rendering.kind === 'refused') {
          io.stderr(`error: ${rendering.reason}\n`);
          return 1;
        }
        io.stdout(`${JSON.stringify(Object.fromEntries(rendering.files))}\n`);
        return 0;
      }
      const outcome = wikiIndexWriter.write(io.cwd);
      if (outcome.kind === 'refused') {
        io.stderr(`error: ${outcome.reason}\n`);
        return 1;
      }
      const changes = [
        ...outcome.written.map((path) => `wrote: ${path}`),
        ...outcome.removed.map((path) => `removed: ${path}`),
      ];
      io.stdout(
        changes.length === 0 ? `${indexDirectory} is current.\n` : `${changes.join('\n')}\n`,
      );
      return 0;
    },
  };
}
