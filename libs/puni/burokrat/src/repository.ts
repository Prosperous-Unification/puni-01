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

/** The `puni.json` key that declares the repository kind. */
export const repositoryKindKey = 'puni-repo-kind';

/**
 * The `puni.json` key that names the paired repository as `owner/name`: a `code` repository
 * names its records repository, a `records` repository the code repository it serves.
 */
export const repositoryCounterpartKey = 'puni-repo-counterpart';

const counterpartPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

/** A declared repository kind: `code` holds a system, `records` its past and future. */
export type RepositoryKind = (typeof repositoryKinds)[number];

/** What `puni.json` declares. */
export interface RepositoryConfig {
  readonly kind: RepositoryKind;
  /** The paired repository, `owner/name`. */
  readonly counterpart: string;
}

/** A governed repository: the directory holding `puni.json`, and what that file declares. */
export interface Repository extends RepositoryConfig {
  readonly root: string;
}

/** The name part of an `owner/name` counterpart, which is also its directory beside this one. */
export function nameCounterpart(counterpart: string): string {
  return counterpart.slice(counterpart.indexOf('/') + 1);
}

function isRepositoryKind(value: unknown): value is RepositoryKind {
  return repositoryKinds.some((kind) => kind === value);
}

/**
 * Reads `<root>/puni.json`, which holds exactly `puni-repo-kind` and `puni-repo-counterpart`.
 *
 * @throws RepositoryDefect naming the file: `repository.kind` when it is not valid JSON, not an
 *   object, has another key, or lacks a valid kind; `repository.counterpart` when the
 *   counterpart is missing or not `owner/name`.
 */
export function readRepositoryConfig(root: string): RepositoryConfig {
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
  const known: readonly string[] = [repositoryKindKey, repositoryCounterpartKey];
  const unknown = Object.keys(parsed).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    throw refuse(`has unknown keys ${unknown.join(', ')}; it holds only ${known.join(' and ')}`);
  }
  const entries = Object.entries(parsed);
  const kind: unknown = entries.find(([key]) => key === repositoryKindKey)?.[1];
  if (!isRepositoryKind(kind)) {
    throw refuse(
      `has ${repositoryKindKey} ${kind === undefined ? 'missing' : JSON.stringify(kind)}; expected one of ${repositoryKinds.join(', ')}`,
    );
  }
  const counterpart: unknown = entries.find(([key]) => key === repositoryCounterpartKey)?.[1];
  if (typeof counterpart !== 'string' || !counterpartPattern.test(counterpart)) {
    throw new RepositoryDefect(
      'repository.counterpart',
      'puni.json',
      `${file} has ${repositoryCounterpartKey} ${counterpart === undefined ? 'missing' : JSON.stringify(counterpart)}; expected the paired repository as owner/name`,
    );
  }
  return { kind, counterpart };
}

/**
 * The repository governing `cwd`: the nearest directory at or above it holding `puni.json`.
 *
 * @throws RepositoryDefect (`repository.root`) when no such directory exists up to the
 *   filesystem root, or as {@link readRepositoryConfig} does.
 */
export function findRepository(cwd: string): Repository {
  let directory = resolve(cwd);
  for (;;) {
    if (existsSync(join(directory, 'puni.json'))) {
      return { root: directory, ...readRepositoryConfig(directory) };
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
