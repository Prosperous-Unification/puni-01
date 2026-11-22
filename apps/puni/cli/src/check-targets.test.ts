import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../../../', import.meta.url).pathname;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function field(value: unknown, ...keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error(`${JSON.stringify(value)} is not an array`);
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new Error(`${JSON.stringify(entry)} is not a string`);
    return entry;
  });
}

const nx = readJson('nx.json');
const checkInputs = readStrings(field(nx, 'namedInputs', 'puniBurCheck'));
const sharedGlobals = readStrings(field(nx, 'namedInputs', 'sharedGlobals'));
const defaultInputs = readStrings(field(nx, 'namedInputs', 'default'));

function listProjectFiles(): string[] {
  const child = Bun.spawnSync(
    [
      'git',
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ':(glob)**/project.json',
    ],
    { cwd: root },
  );
  if (child.exitCode !== 0) throw new Error(`git ls-files failed: ${child.stderr.toString()}`);
  return child.stdout
    .toString()
    .split('\0')
    .filter((path) => path !== '');
}

function matchesInput(inputs: readonly string[], path: string): boolean {
  return inputs.some((input) => new Bun.Glob(input.replace('{workspaceRoot}/', '')).match(path));
}

describe('puni-bur-check targets', () => {
  test('the target default runs the scoped check for the project, cached', () => {
    const target = field(nx, 'targetDefaults', 'puni-bur-check');
    expect(field(target, 'cache')).toBe(true);
    expect(field(target, 'options', 'command')).toBe(
      'bun apps/puni/cli/src/entrypoint.ts burokrat check --project {projectName}',
    );
    expect(readStrings(field(target, 'inputs'))).toEqual(['default', 'puniBurCheck']);
  });

  test.each(listProjectFiles())('%s declares the target', (path) => {
    expect(field(readJson(path), 'targets', 'puni-bur-check')).toBeDefined();
  });

  test('the root package.json adds no script targets, which would make workspace run nx recursively', () => {
    expect(field(readJson('package.json'), 'nx', 'includedScripts')).toEqual([]);
    expect(Object.keys(field(readJson('project.json'), 'targets') ?? {})).toEqual([
      'puni-bur-check',
    ]);
  });

  test('only the root project overrides the target inputs', () => {
    const overriding = listProjectFiles().filter(
      (path) => field(readJson(path), 'targets', 'puni-bur-check', 'inputs') !== undefined,
    );
    expect(overriding).toEqual(['project.json']);
  });

  test('every project check reads its own files and the shared globals', () => {
    expect(defaultInputs).toContain('{projectRoot}/**/*');
    expect(defaultInputs).toContain('sharedGlobals');
    for (const path of ['package.json', 'bun.lock', 'tsconfig.base.json']) {
      expect(matchesInput(sharedGlobals, path)).toBe(true);
    }
  });

  test('every project check reads the checker, puni.json, every .gitignore and the Bun version', () => {
    const cli = readJson('apps/puni/cli/package.json');
    expect(field(cli, 'bin', 'puni')).toBe('src/entrypoint.ts');
    const aliases = field(readJson('tsconfig.base.json'), 'compilerOptions', 'paths');
    const libraries = Object.values(aliases ?? {}).flatMap((targets) =>
      readStrings(targets).map((target) => target.replace(/^\.\//u, '')),
    );
    expect(libraries.length).toBeGreaterThan(0);
    for (const path of [
      'apps/puni/cli/src/entrypoint.ts',
      'apps/puni/cli/src/cli.ts',
      'apps/puni/cli/package.json',
      ...libraries,
      'libs/puni/burokrat/src/check/scope.ts',
      'puni.json',
      '.gitignore',
      'libs/puni/dash/.gitignore',
      '.bun-version',
    ]) {
      expect([path, matchesInput(checkInputs, path)]).toEqual([path, true]);
    }
  });

  test('the root project check reads every file: the index derives from every project, and links into other projects are judged there', () => {
    expect(
      readStrings(field(readJson('project.json'), 'targets', 'puni-bur-check', 'inputs')),
    ).toEqual(['{workspaceRoot}/**/*']);
    expect(field(readJson('project.json'), 'name')).toBe('workspace');
  });
});
