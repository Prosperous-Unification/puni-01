import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findDefect, type Finding } from '@puni/shared-failures';
import {
  fixtureRemotes,
  nodeHostModule,
  removeScratchDirectoriesAfterEach,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { checkoutDefects } from './failures';
import { checkoutModule } from './module';
import {
  formatRegistry,
  type Repository,
  type RepositoryRegistry,
  type RepositoryType,
} from './registry';
import { makeRegistryPair, type RegistryPair } from './registry.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let pair: RegistryPair = { state: '', records: '' };

const container = DiBag.createBuilder()
  .withInstalledModules([nodeHostModule, checkoutModule])
  .buildContainer();

afterAll(async () => {
  await container.close();
});

beforeEach(() => {
  pair = makeRegistryPair(scratchDirectories);
});

function findRepository(cwd: string): Repository {
  return container.resolve('checkoutRegistry').locate(cwd);
}

function readRegistry(root: string): RepositoryRegistry {
  return findRepository(root).registry;
}

function resolveRepository(found: Repository, type: RepositoryType): Repository {
  return container.resolve('checkoutRegistry').resolve(found, type);
}

function refusal(run: () => unknown): Finding {
  try {
    run();
  } catch (cause) {
    const defect = findDefect(cause, checkoutDefects);
    if (defect !== undefined) return defect;
    throw cause;
  }
  throw new Error('nothing was refused');
}

const state = {
  type: 'system-state',
  remote: { type: 'github', url: fixtureRemotes['system-state'] },
};
const records = {
  type: 'system-records',
  remote: { type: 'github', url: fixtureRemotes['system-records'] },
};

function writeConfig(config: unknown): void {
  writeFileSync(join(pair.state, 'puni.json'), JSON.stringify(config));
}

describe('readRegistry', () => {
  test('reads this repository type and every listed repository', () => {
    const registry: unknown = readRegistry(pair.state);
    expect(registry).toEqual({
      thisType: 'system-state',
      rules: 1,
      repos: { 'system-state': state, 'system-records': records },
    });
  });

  test('top-level keys starting x- are tolerated and ignored', () => {
    writeConfig({
      'x-note': { anything: true },
      'this-repo-type': 'system-state',
      rules: 4,
      'all-repos': [state, records],
      'x-': 1,
    });
    const registry: unknown = readRegistry(pair.state);
    expect(registry).toEqual({
      thisType: 'system-state',
      rules: 4,
      repos: { 'system-state': state, 'system-records': records },
    });
  });

  const defects: readonly (readonly [string, unknown, string])[] = [
    ['not JSON', '{this-repo-type', 'is not valid JSON: '],
    ['not an object', '[]', 'is not a JSON object'],
    ...(['repos', 'xtra'] as const).map((key): readonly [string, unknown, string] => [
      `an unknown top-level key ${key}`,
      { 'this-repo-type': 'system-state', rules: 1, 'all-repos': [state, records], [key]: {} },
      `has unknown keys ${key}; it holds only this-repo-type, rules, all-repos and keys starting x- (or upgrade puni, if a newer puni wrote them)`,
    ]),
    [
      'rules missing',
      { 'this-repo-type': 'system-state', 'all-repos': [state, records] },
      `rules is missing; expected a positive integer of at most ${String(Number.MAX_SAFE_INTEGER)} ("rules": 1 keeps the verdict the repository had)`,
    ],
    ...[0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1].map(
      (rules): readonly [string, unknown, string] => [
        `rules ${JSON.stringify(rules)}`,
        { 'this-repo-type': 'system-state', rules, 'all-repos': [state, records] },
        `rules is ${JSON.stringify(rules)}; expected a positive integer of at most ${String(Number.MAX_SAFE_INTEGER)}`,
      ],
    ),
    [
      'all-repos missing',
      { 'this-repo-type': 'system-state' },
      'all-repos is missing; expected a non-empty array',
    ],
    [
      'all-repos not an array',
      { 'this-repo-type': 'system-state', 'all-repos': {} },
      'all-repos is {}; expected a non-empty array',
    ],
    [
      'all-repos empty',
      { 'this-repo-type': 'system-state', 'all-repos': [] },
      'all-repos is []; expected a non-empty array',
    ],
    [
      'an entry not an object',
      { 'this-repo-type': 'system-state', 'all-repos': [state, 'x'] },
      'all-repos[1] is "x"; expected an object',
    ],
    [
      'an unknown entry key',
      { 'this-repo-type': 'system-state', 'all-repos': [state, { ...records, self: true }] },
      'all-repos[1] has unknown keys self; it holds only type, remote',
    ],
    [
      'an unknown repository type',
      {
        'this-repo-type': 'system-state',
        'all-repos': [state, { ...records, type: 'system-docs' }],
      },
      'all-repos[1].type is "system-docs"; expected one of system-state, system-records',
    ],
    [
      'a type listed twice',
      { 'this-repo-type': 'system-state', 'all-repos': [state, records, state] },
      'all-repos[2].type system-state is listed twice; each type appears once',
    ],
    [
      'a required type absent',
      { 'this-repo-type': 'system-state', 'all-repos': [state] },
      'all-repos lacks the types system-records',
    ],
    [
      'remote missing',
      { 'this-repo-type': 'system-state', 'all-repos': [{ type: 'system-state' }, records] },
      'all-repos[0].remote is missing; expected an object',
    ],
    [
      'remote not an object',
      { 'this-repo-type': 'system-state', 'all-repos': [state, { ...records, remote: 'github' }] },
      'all-repos[1].remote is "github"; expected an object',
    ],
    [
      'an unknown remote key',
      {
        'this-repo-type': 'system-state',
        'all-repos': [state, { ...records, remote: { ...records.remote, branch: 'main' } }],
      },
      'all-repos[1].remote has unknown keys branch; it holds only type, url',
    ],
    [
      'a bad remote type',
      {
        'this-repo-type': 'system-state',
        'all-repos': [state, { ...records, remote: { ...records.remote, type: 'gitlab' } }],
      },
      'all-repos[1].remote.type is "gitlab"; expected one of github',
    ],
    ...[
      'https://github.com/acme/demo-records/',
      'https://github.com/acme/demo-records.git',
      'http://github.com/acme/demo-records',
      'https://gitlab.com/acme/demo-records',
      'https://github.com/demo-records',
      'https://github.com/acme/demo/records',
      7,
    ].map((url): readonly [string, unknown, string] => [
      `a remote url ${JSON.stringify(url)}`,
      {
        'this-repo-type': 'system-state',
        'all-repos': [state, { ...records, remote: { type: 'github', url } }],
      },
      `all-repos[1].remote.url is ${JSON.stringify(url)}; expected https://github.com/<owner>/<name> with no trailing slash or .git`,
    ]),
    [
      'this-repo-type missing',
      { 'all-repos': [state, records] },
      'this-repo-type is missing; expected a type listed in all-repos: system-state, system-records',
    ],
    [
      'this-repo-type not a string',
      { 'this-repo-type': 1, 'all-repos': [state, records] },
      'this-repo-type is 1; expected a type listed in all-repos: system-state, system-records',
    ],
    [
      'this-repo-type naming an unlisted type',
      { 'this-repo-type': 'system-docs', 'all-repos': [state, records] },
      'this-repo-type is "system-docs"; expected a type listed in all-repos: system-state, system-records',
    ],
  ];

  test.each(defects)(
    '%s is a repository.config defect naming the file',
    (_name, config, problem) => {
      if (typeof config === 'string') writeFileSync(join(pair.state, 'puni.json'), config);
      else writeConfig(config);
      const defect = refusal(() => readRegistry(pair.state));
      expect(defect.rule).toBe('repository.config');
      expect(defect.path).toBe('puni.json');
      expect(defect.message).toStartWith(`${join(pair.state, 'puni.json')} ${problem}`);
    },
  );
});

describe('findRepository', () => {
  test('walks up to the nearest puni.json, the repository of this-repo-type', () => {
    mkdirSync(join(pair.state, 'a/b'), { recursive: true });
    expect(findRepository(join(pair.state, 'a/b'))).toEqual({
      root: resolve(pair.state),
      type: 'system-state',
      registry: readRegistry(pair.state),
    });
  });

  test('a records repository holding its own puni.json is found as system-records', () => {
    writeRepositoryFile(
      pair.records,
      'puni.json',
      formatRegistry('system-records', fixtureRemotes, 1),
    );
    expect(findRepository(pair.records).type).toBe('system-records');
  });

  test('standing in a records checkout without puni.json is repository.root with the hint', () => {
    const defect = refusal(() => findRepository(pair.records));
    expect(defect.rule).toBe('repository.root');
    expect(defect.message).toBe(
      `no puni.json in ${pair.records} or any directory above it; run puni from the system-state repository, which holds puni.json`,
    );
  });
});

describe('resolveRepository', () => {
  test('its own type is the repository found; another is the checkout beside it', () => {
    const found = findRepository(pair.state);
    expect(resolveRepository(found, 'system-state')).toBe(found);
    expect(resolveRepository(found, 'system-records')).toEqual({
      root: pair.records,
      type: 'system-records',
      registry: found.registry,
    });
  });

  test.each([
    [
      'missing',
      () => {
        rmSync(pair.records, { recursive: true });
      },
    ],
    [
      'a file in its place',
      () => {
        rmSync(pair.records, { recursive: true });
        writeFileSync(pair.records, 'not a checkout');
      },
    ],
  ])('a records checkout %s is a repository.checkout defect naming the path', (_name, breach) => {
    breach();
    const defect = refusal(() => resolveRepository(findRepository(pair.state), 'system-records'));
    expect(defect.rule).toBe('repository.checkout');
    expect(defect.message).toBe(
      `the system-records repository is not checked out at ${pair.records}; clone ${fixtureRemotes['system-records']} there`,
    );
  });
});
