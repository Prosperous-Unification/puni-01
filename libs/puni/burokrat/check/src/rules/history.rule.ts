import { nameRepository } from '@puni/shared-checkout';
import type { Finding, RuleReading } from '../finding';

/**
 * No ISO date (`YYYY-MM-DD`) in any visible Markdown file the scope owns. A git that cannot list
 * the files is a finding.
 */
export function forbidDates({ files, scope }: RuleReading): Finding[] {
  const rule = 'history.date';
  const listing = files.listVisible(scope);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  return listing.files
    .filter((path) => path.endsWith('.md'))
    .flatMap((path) =>
      files
        .readText(path)
        .split('\n')
        .flatMap((line, index) =>
          [...line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map((date) => ({
            rule,
            path,
            message: `line ${String(index + 1)} holds the date ${date[0]}`,
          })),
        ),
    );
}

/**
 * The records repository, the last URL segment of `system-records` in the registry, is named
 * only in `puni.json` and `AGENTS.md` (and `CLAUDE.md`, the same file). It judges the visible
 * files the scope owns, tracked or untracked and not ignored, so staging a file never changes the
 * result.
 */
export function confineRecordsName({ files, registry, scope }: RuleReading): Finding[] {
  const rule = 'history.records';
  const listing = files.listVisible(scope);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  const records = nameRepository(registry.repos['system-records']);
  const exempt: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'puni.json'];
  return listing.files
    .filter((path) => !exempt.includes(path))
    .filter((path) => files.readText(path).includes(records))
    .map((path) => ({ rule, path, message: `names the records repository ${records}` }));
}
