import { posix } from 'node:path';
import { RegistryInvalid } from './failures';
import { describeValue, isRecord, parseJson, requireOnlyKeys } from './json';
import { formatJson } from './json-format';
import { isPartitionPath } from './partition-path';

/** The `puni.json` key naming the type of the repository that holds the file. */
export const thisRepoTypeKey = 'this-repo-type';

/** The `puni.json` key listing every repository of the project. */
export const allReposKey = 'all-repos';

/** The `puni.json` key holding the rules epoch the project is judged at. */
export const rulesKey = 'rules';

/** The prefix of a top-level `puni.json` key that the registry tolerates and ignores. */
export const extensionKeyPrefix = 'x-';
/** The `puni.json` key giving the purpose of each partition of the map. */
export const mapKey = 'map';

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
 * repositories are judged at, every repository, and the purpose of each partition of the map by
 * partition path (empty when `map` is absent).
 */
export interface RepositoryRegistry {
  readonly thisType: RepositoryType;
  /** The rules epoch: `puni burokrat check` applies only the rules introduced at or before it. */
  readonly rules: number;
  readonly repos: Readonly<Record<RepositoryType, RepositoryEntry>>;
  readonly map: ReadonlyMap<string, string>;
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

/** The `map` object of `puni.json`: each key a partition path, each value a non-empty string. */
function readMap(value: unknown, refuse: Refuse): ReadonlyMap<string, string> {
  if (value === undefined) return new Map();
  if (!isRecord(value)) return refuse(`${mapKey} is ${describeValue(value)}; expected an object`);
  return new Map(
    Object.entries(value).map(([path, purpose]): [string, string] => {
      if (!isPartitionPath(path)) {
        refuse(
          `${mapKey} key ${JSON.stringify(path)} is no partition path; expected lower-case segments joined by /`,
        );
      }
      if (typeof purpose !== 'string' || purpose === '') {
        refuse(`${mapKey}.${path} is ${describeValue(purpose)}; expected a non-empty string`);
      }
      return [path, purpose];
    }),
  );
}

/**
 * Parses the text of `puni.json` at `file`, the one typed reader of the project's repository
 * registry: exactly `this-repo-type` (a type listed in `all-repos`), `rules` (a positive integer)
 * and `all-repos` (a non-empty list of `{ type, remote: { type, url } }`, each of
 * {@link repositoryTypes} exactly once); optionally `map` (an object from partition path to
 * purpose); and any top-level keys starting `x-`, which are ignored.
 *
 * @throws RegistryInvalid naming the file and the problem, with the index of the offending entry.
 */
export function parseRegistry(text: string, file: string): RepositoryRegistry {
  return readRegistryDocument(text, file).registry;
}

/**
 * The registry `text` declares, and the JSON object it was read from.
 *
 * @throws RegistryInvalid as {@link parseRegistry} does.
 */
function readRegistryDocument(
  text: string,
  file: string,
): { readonly document: Readonly<Record<string, unknown>>; readonly registry: RepositoryRegistry } {
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
  requireOnlyKeys(
    Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !key.startsWith(extensionKeyPrefix)),
    ),
    [thisRepoTypeKey, rulesKey, allReposKey, mapKey],
    '',
    (problem) =>
      refuse(
        `${problem} and keys starting ${extensionKeyPrefix} (or upgrade puni, if a newer puni wrote them)`,
      ),
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
  if (typeof rules !== 'number' || !Number.isSafeInteger(rules) || rules < 1) {
    const keep =
      rules === undefined ? ` ("${rulesKey}": 1 keeps the verdict the repository had)` : '';
    return refuse(
      `${rulesKey} is ${describeValue(rules)}; expected a positive integer of at most ${String(Number.MAX_SAFE_INTEGER)}${keep}`,
    );
  }
  const listed = (type: RepositoryType): RepositoryEntry =>
    byType.get(type) ?? refuse(`${allReposKey} lacks the types ${type}`);
  return {
    document: parsed,
    registry: {
      thisType,
      rules,
      repos: {
        'system-state': listed('system-state'),
        'system-records': listed('system-records'),
      },
      map: readMap(parsed[mapKey], refuse),
    },
  };
}

/**
 * The text of a `puni.json` declaring `thisType`, the rules epoch `rules`, every repository type
 * at its remote in `remotes`, and the partition purposes of `map`, left out when it is empty: what
 * {@link parseRegistry} reads back as the same registry.
 */
export function formatRegistry(
  thisType: RepositoryType,
  remotes: Readonly<Record<RepositoryType, string>>,
  rules: number,
  map: ReadonlyMap<string, string> = new Map(),
): string {
  return JSON.stringify({
    [thisRepoTypeKey]: thisType,
    [rulesKey]: rules,
    [allReposKey]: repositoryTypes.map((type) => ({
      type,
      remote: { type: 'github', url: remotes[type] },
    })),
    ...(map.size === 0 ? {} : { [mapKey]: Object.fromEntries(map) }),
  });
}

/**
 * The `puni.json` text `text`, which {@link parseRegistry} accepts, with its rules epoch set to
 * `rules`: every other key and value kept in its order, printed by {@link formatJson}.
 *
 * @throws RegistryInvalid naming `file` when `text` is not a valid registry.
 */
export function repinRegistry(text: string, file: string, rules: number): string {
  const { document } = readRegistryDocument(text, file);
  return formatJson({ ...document, [rulesKey]: rules });
}
