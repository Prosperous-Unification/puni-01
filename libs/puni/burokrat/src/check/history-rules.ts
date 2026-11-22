import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nameRepository } from '../registry';
import type { Finding, RepositoryReading } from './finding';
import { isRegularFile, listScopeFiles, listScopeMarkdown, visibleFiles } from './scope';

/**
 * No ISO date (`YYYY-MM-DD`) in any Markdown file the scope owns that git shows. A git that
 * cannot list the files is a finding.
 */
export function forbidDates({ root, scope }: RepositoryReading): Finding[] {
  const rule = 'history.date';
  const listing = listScopeMarkdown(root, scope);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  return listing.files.flatMap((path) =>
    readFileSync(join(root, path), 'utf8')
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
 * only in `puni.json` and
 * `AGENTS.md` (and `CLAUDE.md`, the same file). It judges the regular files the scope owns that
 * git shows, tracked or untracked and not ignored, so staging a file never changes the result.
 */
export function confineRecordsName({ root, registry, scope }: RepositoryReading): Finding[] {
  const rule = 'history.records';
  const listing = listScopeFiles(root, scope, visibleFiles);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  const records = nameRepository(registry.repos['system-records']);
  const exempt: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'puni.json'];
  return listing.files
    .filter((path) => !exempt.includes(path))
    .filter((path) => isRegularFile(root, path))
    .filter((path) => readFileSync(join(root, path), 'utf8').includes(records))
    .map((path) => ({ rule, path, message: `names the records repository ${records}` }));
}
