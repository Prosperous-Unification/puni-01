import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

/**
 * Something wrong with the repository's own inputs, such as a missing `nx.json` or a project
 * without `readWhen`. Commands report it as one line, never as a stack trace.
 */
export class RepositoryDefect extends Error {
  override readonly name = 'RepositoryDefect';
}

/**
 * The nearest directory at or above `cwd` that holds an `nx.json`.
 *
 * @throws RepositoryDefect when no such directory exists up to the filesystem root.
 */
export function findRepositoryRoot(cwd: string): string {
  let directory = resolve(cwd);
  for (;;) {
    if (existsSync(join(directory, 'nx.json'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) {
      throw new RepositoryDefect(`no nx.json in ${cwd} or any directory above it`);
    }
    directory = parent;
  }
}

/** Orders strings by their UTF-8 bytes. */
export function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/**
 * Files under `directory`, as POSIX paths relative to `root`, recursively. `node_modules` is
 * never entered; symlinks and other non-regular entries are skipped.
 */
export function listFiles(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(root, path);
    return entry.isFile() ? [path] : [];
  });
}

/** The authored and generated Markdown files a check reads: entry files and `wiki/**`. */
export function listMarkdownFiles(root: string): string[] {
  const entries = ['AGENTS.md', 'README.md'].filter((path) => existsSync(join(root, path)));
  const wiki = existsSync(join(root, 'wiki'))
    ? listFiles(root, 'wiki').filter((path) => path.endsWith('.md'))
    : [];
  return [...entries, ...wiki];
}
