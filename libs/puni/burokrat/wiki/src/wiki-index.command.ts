import { constant, object } from '@optique/core';
import type { Command } from '@puni/shared-command';
import { indexDirectory } from '@puni/shared-checkout';
import type { WikiIndexRequest, WikiIndexWriter } from './contract';

/** `wiki index`: rewrites `wiki/index/` from the repository's projects, pages and commands. */
export const wikiIndexParser = object({ kind: constant('wiki index') });

/**
 * The `wiki index` command: prints each `wrote:` and `removed:` path, or that the index is
 * current, and returns 0; a refusal prints one `error: ` line to `stderr` and returns 1.
 */
export function createWikiIndexCommand({
  wikiIndexWriter,
}: {
  wikiIndexWriter: WikiIndexWriter;
}): Command<WikiIndexRequest> {
  return {
    run(_request, io) {
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
