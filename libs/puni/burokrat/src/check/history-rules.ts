import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMarkdownFiles, nameCounterpart } from '../repository';
import type { Finding, RepositoryReading } from './finding';
import { listGitFiles } from './git-files';

/** No ISO date (`YYYY-MM-DD`) in `AGENTS.md`, `README.md` or any Markdown file under `wiki/`. */
export function forbidDates({ root }: RepositoryReading): Finding[] {
  return listMarkdownFiles(root).flatMap((path) =>
    readFileSync(join(root, path), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        [...line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map((date) => ({
          rule: 'history.date',
          path,
          message: `line ${String(index + 1)} holds the date ${date[0]}`,
        })),
      ),
  );
}

/**
 * The records repository, the counterpart `puni.json` declares, is named only in `puni.json` and
 * `AGENTS.md` (and `CLAUDE.md`, the same file). Tracked files are those `git ls-files` lists that
 * exist on disk.
 */
export function confineRecordsName({ root, counterpart }: RepositoryReading): Finding[] {
  const rule = 'history.records';
  const listing = listGitFiles(root, []);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  const records = nameCounterpart(counterpart);
  const exempt: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'puni.json'];
  return listing.files
    .filter((path) => !exempt.includes(path))
    .filter((path) => existsSync(join(root, path)))
    .filter((path) => readFileSync(join(root, path), 'utf8').includes(records))
    .map((path) => ({ rule, path, message: `names the records repository ${records}` }));
}
