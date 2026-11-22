import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMarkdownFiles } from '../repository';
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

function readPackageName(root: string): string | { readonly failure: string } {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return { failure: 'package.json is missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return { failure: `package.json is not valid JSON: ${cause.message}` };
  }
  const name =
    typeof parsed === 'object' && parsed !== null && 'name' in parsed ? parsed.name : undefined;
  return typeof name === 'string' && name !== '' ? name : { failure: 'package.json has no name' };
}

/**
 * The records repository, `<root package name>-records`, is named only in `AGENTS.md` (and
 * `CLAUDE.md`, the same file). Tracked files are those `git ls-files` lists that exist on disk.
 */
export function confineRecordsName({ root }: RepositoryReading): Finding[] {
  const rule = 'history.records';
  const name = readPackageName(root);
  if (typeof name !== 'string') return [{ rule, path: 'package.json', message: name.failure }];
  const listing = listGitFiles(root, []);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  const records = `${name}-records`;
  return listing.files
    .filter((path) => path !== 'AGENTS.md' && path !== 'CLAUDE.md')
    .filter((path) => existsSync(join(root, path)))
    .filter((path) => readFileSync(join(root, path), 'utf8').includes(records))
    .map((path) => ({ rule, path, message: `names the records repository ${records}` }));
}
