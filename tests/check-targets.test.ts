import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';

const scratchDirectories = removeScratchDirectoriesAfterEach();

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

/** The `&&`-joined step of the `name` script that runs `bun fmt --check`. */
function readFormatStep(name: string): string {
  const script = field(readJson('package.json'), 'scripts', name);
  if (typeof script !== 'string') throw new Error(`package.json has no script ${name}`);
  const step = script.split(' && ').find((part) => part.includes('bun fmt --check'));
  if (step === undefined) throw new Error(`the ${name} script runs no bun fmt --check`);
  return step;
}

/**
 * Runs `step` with `bun` replaced by a stub exiting `exitCode`, through the shell `bun run` uses
 * for a package script.
 */
function runFormatStep(step: string, exitCode: number) {
  const bin = scratchDirectories.createDirectory('puni-format-step-');
  writeFileSync(join(bin, 'bun'), `#!/bin/sh\nexit ${String(exitCode)}\n`, { mode: 0o755 });
  const child = Bun.spawnSync(['sh', '-c', step], {
    env: { PATH: `${bin}:/usr/bin:/bin` },
    stderr: 'pipe',
  });
  return { exitCode: child.exitCode, stderr: child.stderr.toString() };
}

/** Formatting is Bun's own `bun fmt`; Prettier is not a dependency. */
test('prettier is not a dependency', () => {
  const manifest = readJson('package.json');
  expect(field(manifest, 'devDependencies', 'prettier')).toBeUndefined();
  expect(field(manifest, 'dependencies', 'prettier')).toBeUndefined();
});

/**
 * The pre-commit hook runs only the one check whose breach cannot be undone once pushed: the
 * staged secrets check. CI judges everything else, the commits of a pull request included.
 */
test('the pre-commit hook runs only the staged secrets check', () => {
  const hooks = Bun.YAML.parse(readFileSync(join(root, 'lefthook.yml'), 'utf8'));
  expect(hooks).toEqual({
    'pre-commit': {
      commands: {
        secrets: { run: 'bun apps/puni/cli/src/entrypoint.ts burokrat check --staged' },
      },
    },
  });
});

/** The `&&`-joined step of the `gate:affected` script that judges the pull request's commits. */
function readCommitsStep(): string {
  const script = field(readJson('package.json'), 'scripts', 'gate:affected');
  if (typeof script !== 'string') throw new Error('package.json has no script gate:affected');
  const step = script.split(' && ').find((part) => part.includes('--commits'));
  if (step === undefined) throw new Error('gate:affected judges no commits');
  return step;
}

describe('gate:affected judges every commit of the pull request for secrets', () => {
  test('over NX_BASE..HEAD', () => {
    expect(readCommitsStep()).toBe(
      'bun run puni burokrat check --commits "${NX_BASE:?set NX_BASE to the base of the range, as NX_BASE=origin/main}..HEAD"',
    );
  });

  test('without NX_BASE it stops, naming NX_BASE, before running anything', () => {
    const bin = scratchDirectories.createDirectory('puni-commits-step-');
    writeFileSync(join(bin, 'bun'), '#!/bin/sh\necho ran\n', { mode: 0o755 });
    const child = Bun.spawnSync(['sh', '-c', readCommitsStep()], {
      env: { PATH: `${bin}:/usr/bin:/bin` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).not.toBe(0);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toContain('NX_BASE: set NX_BASE to the base of the range');
  });
});

describe('the CI workflow judges every push for secrets', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

  test('on pushes to every branch and tag', () => {
    expect(workflow).toContain("  push:\n    branches: ['**']\n    tags: ['**']\n");
  });

  test('in a job of its own, before and apart from the gate, skipping only a deleted ref', () => {
    expect(workflow).toContain(
      "  pushed-commits:\n    if: github.event_name == 'push' && !github.event.deleted\n",
    );
    expect(workflow.indexOf('  pushed-commits:')).toBeLessThan(workflow.indexOf('  gate:'));
  });

  test('over the pushed range, from main for a new ref, as merged history on main and tags', () => {
    for (const line of [
      'if [ "$base" = 0000000000000000000000000000000000000000 ]; then base=origin/main; fi',
      'git cat-file -e "$base^{commit}"',
      'case "$GITHUB_REF" in refs/heads/main | refs/tags/*) merged=--merged ;; esac',
      'bun run puni burokrat check --commits "$base..$PUSHED_RANGE_HEAD" $merged',
      'bun run puni burokrat check --commits "$MERGE_GROUP_BASE..HEAD"',
    ]) {
      expect([line, workflow.includes(line)]).toEqual([line, true]);
    }
  });
});

describe('the gate format step', () => {
  test.each(gateScripts)('%s prints the remedy when bun fmt --check fails', (name) => {
    expect(runFormatStep(readFormatStep(name), 1)).toEqual({
      exitCode: 1,
      stderr: 'fix: run bun run fix\n',
    });
  });

  test.each(gateScripts)('%s passes quietly when bun fmt --check passes', (name) => {
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
