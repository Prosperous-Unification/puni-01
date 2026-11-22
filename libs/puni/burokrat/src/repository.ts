import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

/**
 * Something wrong with the repository's own inputs, such as a missing `puni.json` or a project
 * without `readWhen`. Commands report it as one line, never as a stack trace. `rule` and `path`
 * place it as a `check` finding.
 */
export class RepositoryDefect extends Error {
  override readonly name = 'RepositoryDefect';

  constructor(
    readonly rule: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** The kinds of repository `puni` governs; `puni.json` declares one. */
export const repositoryKinds = ['code', 'records'] as const;

/** The one key `puni.json` holds. */
export const repositoryKindKey = 'puni-repo-kind';

/** A declared repository kind: `code` holds a system, `records` its past and future. */
export type RepositoryKind = (typeof repositoryKinds)[number];

/** A governed repository: the directory holding `puni.json`, and the kind it declares. */
export interface Repository {
  readonly root: string;
  readonly kind: RepositoryKind;
}

function isRepositoryKind(value: unknown): value is RepositoryKind {
  return repositoryKinds.some((kind) => kind === value);
}

/**
 * Reads `<root>/puni.json`, which holds exactly `{ "puni-repo-kind": <kind> }`.
 *
 * @throws RepositoryDefect (`repository.kind`) naming the file when it is not valid JSON, not an
 *   object, has a key other than `puni-repo-kind`, or lacks a valid one.
 */
export function readRepositoryKind(root: string): RepositoryKind {
  const file = join(root, 'puni.json');
  const refuse = (problem: string): RepositoryDefect =>
    new RepositoryDefect('repository.kind', 'puni.json', `${file} ${problem}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    throw refuse(`is not valid JSON: ${cause.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw refuse('is not a JSON object');
  }
  const unknown = Object.keys(parsed).filter((key) => key !== repositoryKindKey);
  if (unknown.length > 0) {
    throw refuse(`has unknown keys ${unknown.join(', ')}; it holds only "${repositoryKindKey}"`);
  }
  const kind: unknown = Object.entries(parsed).find(([key]) => key === repositoryKindKey)?.[1];
  if (!isRepositoryKind(kind)) {
    throw refuse(
      `has ${repositoryKindKey} ${kind === undefined ? 'missing' : JSON.stringify(kind)}; expected one of ${repositoryKinds.join(', ')}`,
    );
  }
  return kind;
}

/**
 * The repository governing `cwd`: the nearest directory at or above it holding `puni.json`.
 *
 * @throws RepositoryDefect (`repository.root`) when no such directory exists up to the
 *   filesystem root, or as {@link readRepositoryKind} does.
 */
export function findRepository(cwd: string): Repository {
  let directory = resolve(cwd);
  for (;;) {
    if (existsSync(join(directory, 'puni.json'))) {
      return { root: directory, kind: readRepositoryKind(directory) };
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new RepositoryDefect(
        'repository.root',
        '.',
        `no puni.json in ${cwd} or any directory above it`,
      );
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
