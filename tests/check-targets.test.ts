import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;

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

/** A project-relative pattern as a positive glob, or a negated one prefixed with `!`. */
function project(input: string): string {
  return input.replace('{projectRoot}/', '');
}

/** Whether `path` matches `inputs` the way Nx reads them: some positive glob, and no negated one. */
function matchesInput(inputs: readonly string[], path: string): boolean {
  const globs = inputs.map((input) => input.replace('{workspaceRoot}/', ''));
  const included = globs.filter((glob) => !glob.startsWith('!'));
  const excluded = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));
  return (
    included.some((glob) => new Bun.Glob(glob).match(path)) &&
    !excluded.some((glob) => new Bun.Glob(glob).match(path))
  );
}

describe('puni-bur-check targets', () => {
  test('the target default runs the scoped check for the project, cached', () => {
    const target = field(nx, 'targetDefaults', 'puni-bur-check');
    expect(field(target, 'cache')).toBe(true);
    expect(field(target, 'options', 'command')).toBe(
      'bun apps/puni/cli/src/entrypoint.ts burokrat check --project {projectName}',
    );
    expect(field(target, 'inputs')).toEqual([
      'default',
      'puniBurCheck',
      { projects: 'puni-cli', input: 'checkerSource' },
      { projects: 'puni-cli', dependencies: true, input: 'checkerSource' },
    ]);
  });

  test.each(listProjectFiles())('%s declares the target', (path) => {
    expect(field(readJson(path), 'targets', 'puni-bur-check')).toBeDefined();
  });

  test('the root package.json adds no script targets, which would make workspace run nx recursively', () => {
    expect(field(readJson('package.json'), 'nx', 'includedScripts')).toEqual([]);
    expect(Object.keys(field(readJson('project.json'), 'targets') ?? {})).toEqual([
      'test',
      'lint',
      'typecheck',
      'puni-bur-check',
      'puni-bur-links',
    ]);
  });

  test('Nx infers project edges from imports, so no project declares implicit dependencies', () => {
    expect(field(nx, 'pluginsConfig', '@nx/js', 'analyzeSourceFiles')).toBe(true);
    const declaring = listProjectFiles().filter(
      (path) => field(readJson(path), 'implicitDependencies') !== undefined,
    );
    expect(declaring).toEqual([]);
  });

  test('the package the nx.sync rule names is the sync generator', () => {
    expect(field(readJson('tools/nx-sync/package.json'), 'name')).toBe('@puni/nx-sync');
  });

  test('test helpers are not production inputs', () => {
    expect(readStrings(field(nx, 'namedInputs', 'production'))).toEqual([
      'default',
      '!{projectRoot}/**/*.test.ts',
      '!{projectRoot}/**/*.test-host.ts',
    ]);
  });

  test('the cross-project links check runs uncached over the whole workspace', () => {
    const links = field(readJson('project.json'), 'targets', 'puni-bur-links');
    expect(field(links, 'cache')).toBe(false);
    expect(field(links, 'options', 'command')).toBe(
      'bun apps/puni/cli/src/entrypoint.ts burokrat check --cross-project-links',
    );
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

  /**
   * The checker is the CLI and every library it depends on. It reaches each project's check as a
   * project-scoped input rather than a workspace-root glob, so a change to one library touches only
   * the projects whose results it can change, while any change to checker source still re-runs
   * every check.
   */
  test('every project check reads the checker source, puni.json, every .gitignore and the Bun version', () => {
    const checkerSource = readStrings(field(nx, 'namedInputs', 'checkerSource'));
    const cli = readJson('apps/puni/cli/package.json');
    expect(field(cli, 'bin', 'puni')).toBe('src/entrypoint.ts');
    for (const path of ['package.json', 'src/main.ts', 'src/rules/history.rule.ts', 'src/a.cjs']) {
      expect([path, matchesInput(checkerSource.map(project), path)]).toEqual([path, true]);
    }
    for (const path of ['src/check.test.ts', 'src/check.test-host.ts', 'NOTES.md']) {
      expect([path, matchesInput(checkerSource.map(project), path)]).toEqual([path, false]);
    }
    for (const path of [
      'puni.json',
      '.gitignore',
      'libs/puni/burokrat/check/.gitignore',
      '.bun-version',
    ]) {
      expect([path, matchesInput(checkInputs, path)]).toEqual([path, true]);
    }
  });

  test('the root project check reads its own files, every project.json and nx.json, not the whole workspace', () => {
    expect(
      readStrings(field(readJson('project.json'), 'targets', 'puni-bur-check', 'inputs')),
    ).toEqual([
      'default',
      'puniBurCheck',
      '{workspaceRoot}/**/project.json',
      '{workspaceRoot}/nx.json',
    ]);
    expect(field(readJson('project.json'), 'name')).toBe('workspace');
  });
});

describe('the CI workflow', () => {
  test('runs for pushes to main, pull requests and the merge queue', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const triggers = /^on:\n((?: {2}.*\n)+)/mu.exec(workflow)?.[1] ?? '';
    expect(triggers.match(/^ {2}[a-z_]+:/gmu)).toEqual([
      '  push:',
      '  pull_request:',
      '  merge_group:',
    ]);
  });
});

describe('versions', () => {
  test('bun-types is the Bun of .bun-version', () => {
    const pinned = readFileSync(join(root, '.bun-version'), 'utf8').trim();
    expect(field(readJson('package.json'), 'devDependencies', 'bun-types')).toBe(pinned);
  });
});

/** The scripts of the root `package.json` that run the gate. */
const gateScripts = ['gate', 'gate:affected'];

/** The `&&`-joined step of the `name` script that runs `nx format:check`. */
function readFormatStep(name: string): string {
  const script = field(readJson('package.json'), 'scripts', name);
  if (typeof script !== 'string') throw new Error(`package.json has no script ${name}`);
  const step = script.split(' && ').find((part) => part.includes('format:check'));
  if (step === undefined) throw new Error(`the ${name} script runs no format:check`);
  return step;
}

/**
 * Runs `step` with `nx` replaced by a stub exiting `exitCode`, through the shell `bun run` uses
 * for a package script.
 */
function runFormatStep(step: string, exitCode: number) {
  const bin = mkdtempSync(join(tmpdir(), 'puni-format-step-'));
  try {
    writeFileSync(join(bin, 'nx'), `#!/bin/sh\nexit ${String(exitCode)}\n`, { mode: 0o755 });
    const child = Bun.spawnSync(['sh', '-c', step], {
      env: { PATH: `${bin}:/usr/bin:/bin` },
      stderr: 'pipe',
    });
    return { exitCode: child.exitCode, stderr: child.stderr.toString() };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

describe('the gate format step', () => {
  test.each(gateScripts)('%s prints the remedy when format:check fails', (name) => {
    expect(runFormatStep(readFormatStep(name), 1)).toEqual({
      exitCode: 1,
      stderr: 'fix: run bun run fix\n',
    });
  });

  test.each(gateScripts)('%s passes quietly when format:check passes', (name) => {
    expect(runFormatStep(readFormatStep(name), 0)).toEqual({ exitCode: 0, stderr: '' });
  });
});

/**
 * Every `typecheck` target runs `bunx tsc`, which is TypeScript 7, the native compiler, installed
 * as `@typescript/native`. The `typescript` package stays on TypeScript 6 (`tsc6`) because
 * typescript-eslint and Nx's import analysis load the JavaScript compiler API, which TypeScript 7
 * does not ship. Were the `tsc` binary to come from the `typescript` package again, every
 * typecheck would silently run TypeScript 6.
 */
describe('typecheck targets', () => {
  test('the target default runs bunx tsc on the project', () => {
    expect(field(nx, 'targetDefaults', 'typecheck', 'options', 'command')).toBe(
      'bunx tsc --noEmit -p {projectRoot}/tsconfig.json',
    );
  });

  test('bunx tsc is TypeScript 7', () => {
    const child = Bun.spawnSync(['bunx', 'tsc', '--version'], { cwd: root });
    if (child.exitCode !== 0) throw new Error(`bunx tsc failed: ${child.stderr.toString()}`);
    expect(child.stdout.toString()).toMatch(/^Version 7\./u);
  });
});
