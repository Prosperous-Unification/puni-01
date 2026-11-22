import { nameRepository } from '@puni/shared-checkout';
import { breachListing, type Rule } from '../finding';

/**
 * No ISO date (`YYYY-MM-DD`) in any visible Markdown file the scope owns. A git that cannot list
 * the files is a breach.
 */
export const forbidDates: Rule = {
  id: 'history.date',
  remedy: 'say what is true now without the date; history belongs in a record',
  judge({ files, scope }) {
    const listing = files.listVisible(scope);
    if ('failure' in listing) return breachListing(listing.failure);
    return listing.files
      .filter((path) => path.endsWith('.md'))
      .flatMap((path) =>
        files
          .readText(path)
          .split('\n')
          .flatMap((line, index) =>
            [...line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map((date) => ({
              path,
              message: `line ${String(index + 1)} holds the date ${date[0]}`,
            })),
          ),
      );
  },
};

/**
 * The records repository, the last URL segment of `system-records` in the registry, is named
 * only in `puni.json` and `AGENTS.md` (and `CLAUDE.md`, the same file). It judges the visible
 * files the scope owns, tracked or untracked and not ignored, so staging a file never changes the
 * result.
 */
export const confineRecordsName: Rule = {
  id: 'history.records',
  remedy: 'remove the name; AGENTS.md alone says where the records live',
  judge({ files, registry, scope }) {
    const listing = files.listVisible(scope);
    if ('failure' in listing) return breachListing(listing.failure);
    const records = nameRepository(registry.repos['system-records']);
    const exempt: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'puni.json'];
    return listing.files
      .filter((path) => !exempt.includes(path))
      .filter((path) => files.readText(path).includes(records))
      .map((path) => ({ path, message: `names the records repository ${records}` }));
  },
};
