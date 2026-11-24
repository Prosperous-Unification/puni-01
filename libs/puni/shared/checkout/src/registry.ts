import { posix } from 'node:path';
import { RegistryInvalid } from './failures';
import { describeValue, isRecord, parseJson, requireOnlyKeys } from './json';

/** The `puni.json` key naming the type of the repository that holds the file. */
export const thisRepoTypeKey = 'this-repo-type';

/** The `puni.json` key listing every repository of the project. */
export const allReposKey = 'all-repos';

/** The `puni.json` key holding the rules epoch the project is judged at. */
export const rulesKey = 'rules';

/** The prefix of a top-level `puni.json` key that the registry tolerates and ignores. */
export const extensionKeyPrefix = 'x-';

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

/**
 * What `puni.json` declares: the type of the repository holding it, the rules epoch its
 * repositories are judged at, and every repository.
 */
export interface RepositoryRegistry {
  readonly thisType: RepositoryType;
  /** The rules epoch: `puni burokrat check` applies only the rules introduced at or before it. */
  readonly rules: number;
  readonly repos: Readonly<Record<RepositoryType, RepositoryEntry>>;
}

/** A located repository: its root, its type, and the registry it was found through. */
export interface Repository {
  readonly root: string;
  readonly type: RepositoryType;
  readonly registry: RepositoryRegistry;
}

function isRepositoryType(value: unknown): value is RepositoryType {
  return repositoryTypes.some((type) => type === value);
}

/** The last path segment of a repository's remote URL: its name, and its directory beside its peers. */
export function nameRepository(entry: RepositoryEntry): string {
  return posix.basename(entry.remote.url);
}

type Refuse = (problem: string) => never;

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
 * Parses the text of `puni.json` at `file`, the one typed reader of the project's repository
 * registry: exactly `this-repo-type` (a type listed in `all-repos`), `rules` (a positive integer)
 * and `all-repos` (a non-empty list of `{ type, remote: { type, url } }`, each of
 * {@link repositoryTypes} exactly once), and any top-level keys starting `x-`, which are ignored.
 *
 * @throws RegistryInvalid naming the file and the problem, with the index of the offending entry.
 */
export function parseRegistry(text: string, file: string): RepositoryRegistry {
  const refuse = (problem: string, cause?: unknown): never => {
    const details = { rule: 'repository.config', path: 'puni.json', file, problem } as const;
    throw cause === undefined
      ? new RegistryInvalid({ details })
      : new RegistryInvalid({ details, cause });
  };
  const read = parseJson(text);
  if ('problem' in read) return refuse(read.problem, read.cause);
  const parsed = read.value;
  if (!isRecord(parsed)) return refuse('is not a JSON object');
  const registryKeys = [thisRepoTypeKey, rulesKey, allReposKey];
  requireOnlyKeys(
    Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !key.startsWith(extensionKeyPrefix)),
    ),
    registryKeys,
    '',
    refuse,
  );
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
  const rules = parsed[rulesKey];
  if (typeof rules !== 'number' || !Number.isInteger(rules) || rules < 1) {
    return refuse(`${rulesKey} is ${describeValue(rules)}; expected a positive integer`);
  }
  const listed = (type: RepositoryType): RepositoryEntry =>
    byType.get(type) ?? refuse(`${allReposKey} lacks the types ${type}`);
  return {
    thisType,
    rules,
    repos: { 'system-state': listed('system-state'), 'system-records': listed('system-records') },
  };
}

/**
 * The text of a `puni.json` declaring `thisType`, the rules epoch `rules` and every repository
 * type at its remote in `remotes`: what {@link parseRegistry} reads back as the same registry.
 */
export function formatRegistry(
  thisType: RepositoryType,
  remotes: Readonly<Record<RepositoryType, string>>,
  rules: number,
): string {
  return JSON.stringify({
    [thisRepoTypeKey]: thisType,
    [rulesKey]: rules,
    [allReposKey]: repositoryTypes.map((type) => ({
      type,
      remote: { type: 'github', url: remotes[type] },
    })),
  });
}

/**
 * The `puni.json` text `text`, which {@link parseRegistry} accepts, with its rules epoch set to
 * `rules`: every other key and value kept in its order, printed as JSON indented by two spaces
 * with a final newline.
 *
 * @throws RegistryInvalid naming `file` when `text` is not a valid registry.
 */
export function repinRegistry(text: string, file: string, rules: number): string {
  parseRegistry(text, file);
  const read = parseJson(text);
  const parsed = 'value' in read && isRecord(read.value) ? read.value : {};
  return `${JSON.stringify({ ...parsed, [rulesKey]: rules }, null, 2)}\n`;
}
