import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { RepositoryDefect } from './repository';

/** The `puni.json` key naming the type of the repository that holds the file. */
export const thisRepoTypeKey = 'this-repo-type';

/** The `puni.json` key listing every repository of the project. */
export const allReposKey = 'all-repos';

/**
 * The repository types of a project, each listed once in `all-repos` and all required: its
 * system as it is, and that system's records.
 */
export const repositoryTypes = ['system-state', 'system-records'] as const;

/** A repository type. */
export type RepositoryType = (typeof repositoryTypes)[number];

/** The remote types a repository may name. */
export const remoteTypes = ['github'] as const;

/** The URL form of a `github` remote: `https://github.com/<owner>/<name>`, nothing after. */
export const githubUrlPattern =
  /^https:\/\/github\.com\/[A-Za-z0-9-]+\/(?![^/]*\.git$)[A-Za-z0-9._-]+$/u;

/** Where a repository lives. */
export interface Remote {
  readonly type: (typeof remoteTypes)[number];
  readonly url: string;
}

/** One listed repository. */
export interface RepositoryEntry {
  readonly type: RepositoryType;
  readonly remote: Remote;
}

/** What `puni.json` declares: the type of the repository holding it, and every repository. */
export interface RepositoryRegistry {
  readonly thisType: RepositoryType;
  readonly repos: Readonly<Record<RepositoryType, RepositoryEntry>>;
}

/** A located repository: its root, its type, and the registry it was found through. */
export interface Repository {
  readonly root: string;
  readonly type: RepositoryType;
  readonly registry: RepositoryRegistry;
}

function describeValue(value: unknown): string {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRepositoryType(value: unknown): value is RepositoryType {
  return repositoryTypes.some((type) => type === value);
}

/** The last path segment of a repository's remote URL: its name, and its directory beside its peers. */
export function nameRepository(entry: RepositoryEntry): string {
  return posix.basename(entry.remote.url);
}

type Refuse = (problem: string) => never;

function requireOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  where: string,
  refuse: Refuse,
): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    const subject = where === '' ? '' : `${where} `;
    refuse(`${subject}has unknown keys ${unknown.join(', ')}; it holds only ${keys.join(' and ')}`);
  }
}

function readRemote(value: unknown, where: string, refuse: Refuse): Remote {
  if (!isRecord(value)) return refuse(`${where} is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, ['type', 'url'], where, refuse);
  const type = remoteTypes.find((candidate) => candidate === value['type']);
  if (type === undefined) {
    refuse(
      `${where}.type is ${describeValue(value['type'])}; expected one of ${remoteTypes.join(', ')}`,
    );
  }
  const url = value['url'];
  if (typeof url !== 'string' || !githubUrlPattern.test(url)) {
    refuse(
      `${where}.url is ${describeValue(url)}; expected https://github.com/<owner>/<name> with no trailing slash or .git`,
    );
  }
  return { type, url };
}

function readEntry(value: unknown, where: string, refuse: Refuse): RepositoryEntry {
  if (!isRecord(value)) return refuse(`${where} is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, ['type', 'remote'], where, refuse);
  const type = value['type'];
  if (!isRepositoryType(type)) {
    refuse(
      `${where}.type is ${describeValue(type)}; expected one of ${repositoryTypes.join(', ')}`,
    );
  }
  return { type, remote: readRemote(value['remote'], `${where}.remote`, refuse) };
}

/**
 * Reads `<root>/puni.json`, the one typed reader of the project's repository registry: exactly
 * `this-repo-type` (a type listed in `all-repos`) and `all-repos` (a non-empty list of
 * `{ type, remote: { type, url } }`, each of {@link repositoryTypes} exactly once).
 *
 * @throws RepositoryDefect (`repository.config`) naming the file and the problem, with the index
 *   of the offending entry.
 */
export function readRegistry(root: string): RepositoryRegistry {
  const file = join(root, 'puni.json');
  const refuse: Refuse = (problem) => {
    throw new RepositoryDefect('repository.config', 'puni.json', `${file} ${problem}`);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return refuse(`is not valid JSON: ${cause.message}`);
  }
  if (!isRecord(parsed)) return refuse('is not a JSON object');
  requireOnlyKeys(parsed, [thisRepoTypeKey, allReposKey], '', refuse);
  const list = parsed[allReposKey];
  if (!Array.isArray(list) || list.length === 0) {
    return refuse(`${allReposKey} is ${describeValue(list)}; expected a non-empty array`);
  }
  const entries = list.map((value: unknown, index) =>
    readEntry(value, `${allReposKey}[${String(index)}]`, refuse),
  );
  const byType = new Map<RepositoryType, RepositoryEntry>();
  for (const [index, entry] of entries.entries()) {
    if (byType.has(entry.type)) {
      refuse(
        `${allReposKey}[${String(index)}].type ${entry.type} is listed twice; each type appears once`,
      );
    }
    byType.set(entry.type, entry);
  }
  const missing = repositoryTypes.filter((type) => !byType.has(type));
  if (missing.length > 0) refuse(`${allReposKey} lacks the types ${missing.join(', ')}`);
  const thisType = parsed[thisRepoTypeKey];
  if (!isRepositoryType(thisType)) {
    return refuse(
      `${thisRepoTypeKey} is ${describeValue(thisType)}; expected a type listed in ${allReposKey}: ${[...byType.keys()].join(', ')}`,
    );
  }
  // Safe: every type in repositoryTypes was checked present in byType just above.
  const repos = Object.fromEntries(byType) as Record<RepositoryType, RepositoryEntry>;
  return { thisType, repos };
}

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

/**
 * The repository holding the nearest `puni.json` at or above `cwd`, of the type that file
 * declares for it.
 *
 * @throws RepositoryDefect (`repository.root`) when no such file exists up to the filesystem
 *   root, or as {@link readRegistry} does.
 */
export function findRepository(cwd: string): Repository {
  let directory = resolve(cwd);
  for (;;) {
    if (isFile(join(directory, 'puni.json'))) {
      const registry = readRegistry(directory);
      return { root: directory, type: registry.thisType, registry };
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new RepositoryDefect(
        'repository.root',
        '.',
        `no puni.json in ${cwd} or any directory above it; run puni from the system-state repository, which holds puni.json`,
      );
    }
    directory = parent;
  }
}

/**
 * The repository of `type` in the registry `found` was read from: `found` itself for its own
 * type, else the directory beside it named after that repository's remote URL.
 *
 * @throws RepositoryDefect (`repository.checkout`) naming the expected path when it is not a
 *   directory.
 */
export function resolveRepository(found: Repository, type: RepositoryType): Repository {
  if (type === found.type) return found;
  const entry = found.registry.repos[type];
  const root = join(dirname(found.root), nameRepository(entry));
  let isDirectory: boolean;
  try {
    isDirectory = lstatSync(root).isDirectory();
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    isDirectory = false;
  }
  if (!isDirectory) {
    throw new RepositoryDefect(
      'repository.checkout',
      '.',
      `the ${type} repository is not checked out at ${root}; clone ${entry.remote.url} there`,
    );
  }
  return { root, type, registry: found.registry };
}
