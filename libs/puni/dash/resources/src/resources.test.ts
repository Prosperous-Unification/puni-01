import { parse } from '@optique/core';
import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutModule, formatRegistry } from '@puni/shared-checkout';
import {
  closeAfterEach,
  fixtureRemotes,
  nodeHostModule,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import type { Command } from '@puni/shared-command';
import { DiBag } from 'di-bag';
import type { ResourcesExports } from './contract';
import { resourcesParser } from './group';
import { dashResourcesModule } from './module';

const scratchDirectories = removeScratchDirectoriesAfterEach();

const track = closeAfterEach();
const identity = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

function gitOutput(root: string, args: readonly string[]): string {
  return Bun.spawnSync(['git', ...args], { cwd: root })
    .stdout.toString()
    .trim();
}

function open() {
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([nodeHostModule, checkoutModule, dashResourcesModule])
      .buildContainer(),
  );
  const exports: ResourcesExports = {
    dashResourcesCreateCommand: container.resolve('dashResourcesCreateCommand'),
    dashResourcesListCommand: container.resolve('dashResourcesListCommand'),
    dashResourcesExecCommand: container.resolve('dashResourcesExecCommand'),
    dashResourcesRemoveCommand: container.resolve('dashResourcesRemoveCommand'),
  };
  return exports;
}

function runCommand<Request>(command: Command<Request>, request: Request, cwd: string) {
  let stdout = '';
  let stderr = '';
  const code = command.run(request, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

describe('resourcesParser', () => {
  test.each([
    ['', { kind: 'help', path: ['resources'] }],
    ['create --name probe', { kind: 'resources create', name: 'probe', from: 'HEAD' }],
    ['create --name probe --from v1', { kind: 'resources create', name: 'probe', from: 'v1' }],
    ['list', { kind: 'resources list' }],
    [
      'exec probe -- git status --short',
      { kind: 'resources exec', name: 'probe', command: ['git', 'status', '--short'] },
    ],
    ['remove probe', { kind: 'resources remove', name: 'probe', force: false }],
    ['remove probe --force', { kind: 'resources remove', name: 'probe', force: true }],
  ] as const)('%j parses', (line, value) => {
    expect(parse(resourcesParser, line === '' ? [] : line.split(' '))).toEqual({
      success: true,
      value,
    });
  });

  test.each(['create', 'create --from HEAD', 'list stray', 'remove', 'stray'])(
    '%j is refused',
    (line) => {
      expect(parse(resourcesParser, line.split(' ')).success).toBe(false);
    },
  );
});

describe('dash resources over a temporary system-state repository', () => {
  let parent = '';
  let state = '';
  let commands: ResourcesExports;
  const probe = () => join(state, '.worktrees/probe');

  beforeEach(() => {
    parent = scratchDirectories.createDirectory('puni-resources-');
    state = join(parent, 'demo');
    writeRepositoryFile(state, 'puni.json', formatRegistry('system-state', fixtureRemotes));
    writeRepositoryFile(state, '.gitignore', '.worktrees/\n');
    runGit(parent, ['init', '-q', '-b', 'main', state]);
    runGit(state, ['add', '-A']);
    runGit(state, [...identity, 'commit', '-qm', 'state']);
    commands = open();
  });

  const create = (name = 'probe', from = 'HEAD') =>
    runCommand(
      commands.dashResourcesCreateCommand,
      { kind: 'resources create', name, from },
      state,
    );
  const list = (cwd = state) =>
    runCommand(commands.dashResourcesListCommand, { kind: 'resources list' }, cwd);
  const exec = (command: readonly string[], name = 'probe') =>
    runCommand(commands.dashResourcesExecCommand, { kind: 'resources exec', name, command }, state);
  const remove = (force = false, name = 'probe') =>
    runCommand(
      commands.dashResourcesRemoveCommand,
      { kind: 'resources remove', name, force },
      state,
    );

  test('list prints nothing when there are no resources', () => {
    expect(list()).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  test('create adds .worktrees/NAME on resources/NAME from HEAD, prints its path; list shows it clean', () => {
    expect(create()).toEqual({ code: 0, stdout: `${probe()}\n`, stderr: '' });
    expect(gitOutput(probe(), ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('resources/probe');
    expect(gitOutput(probe(), ['rev-parse', 'HEAD'])).toBe(gitOutput(state, ['rev-parse', 'HEAD']));
    expect(list()).toEqual({ code: 0, stdout: 'probe resources/probe clean\n', stderr: '' });
  });

  test('create --from starts at that commit', () => {
    const first = gitOutput(state, ['rev-parse', 'HEAD']);
    writeFileSync(join(state, 'b.md'), 'b');
    runGit(state, ['add', '-A']);
    runGit(state, [...identity, 'commit', '-qm', 'b']);
    expect(create('probe', first).code).toBe(0);
    expect(gitOutput(probe(), ['rev-parse', 'HEAD'])).toBe(first);
  });

  test('list is the same from inside a resource, sorted by name', () => {
    create('zeta');
    create('alpha');
    expect(list(join(state, '.worktrees/zeta')).stdout).toBe(
      'alpha resources/alpha clean\nzeta resources/zeta clean\n',
    );
  });

  test('list shows only worktrees under .worktrees on their resources/ branch', () => {
    runGit(state, ['worktree', 'add', '-q', '-b', 'other', join(parent, 'elsewhere')]);
    runGit(state, ['worktree', 'add', '-q', '-b', 'feature/x', join(state, '.worktrees/x')]);
    runGit(state, ['worktree', 'add', '-q', '-b', 'resources/y', join(parent, 'y')]);
    expect(list()).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(remove(true, 'x')).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: no resource named x; there are no resources\n',
    });
    expect(existsSync(join(state, '.worktrees/x'))).toBe(true);
  });

  test('an existing name is refused, exit 2', () => {
    create();
    expect(create()).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: resource probe cannot be created: a worktree stands at ${probe()}; choose another name or remove it first\n`,
    });
  });

  test('an existing branch is refused, exit 2, and no worktree is made', () => {
    runGit(state, ['branch', 'resources/probe']);
    expect(create()).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: resource probe cannot be created: the branch resources/probe exists; choose another name or remove it first\n',
    });
    expect(existsSync(probe())).toBe(false);
  });

  test.each(['Probe', '../x', 'a/b', '-x', ''])('the name %j is refused, exit 2', (name) => {
    expect(create(name)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: resource name ${JSON.stringify(name)} is refused; expected lower-case letters and digits joined by single hyphens\n`,
    });
  });

  test('an unknown --from is a git failure, exit 1', () => {
    const made = create('probe', 'no-such-ref');
    expect([made.code, made.stdout]).toEqual([1, '']);
    expect(made.stderr).toStartWith(`error: git could not add ${probe()} from no-such-ref: `);
  });

  test('exec runs the command in the worktree and returns its exit code', () => {
    create();
    expect(exec(['sh', '-c', 'touch made-here; exit 7'])).toEqual({
      code: 7,
      stdout: '',
      stderr: '',
    });
    expect(existsSync(join(probe(), 'made-here'))).toBe(true);
    expect(list().stdout).toBe('probe resources/probe dirty\n');
  });

  test.each([
    [['true'], 'nope', 'error: no resource named nope; the resources are probe\n'],
    [[], 'probe', 'error: give the command to run in resource probe\n'],
  ] as const)('exec %j in %s is refused, exit 2', (command, name, stderr) => {
    create();
    expect(exec(command, name)).toEqual({ code: 2, stdout: '', stderr });
  });

  test('exec of a command that cannot start is one error line, exit 1', () => {
    create();
    const ran = exec(['puni-no-such-command']);
    expect([ran.code, ran.stdout]).toEqual([1, '']);
    expect(ran.stderr).toStartWith('error: puni-no-such-command could not start: ');
  });

  test('remove removes a clean, merged resource and its branch', () => {
    create();
    expect(remove()).toEqual({ code: 0, stdout: 'removed probe\n', stderr: '' });
    expect(existsSync(probe())).toBe(false);
    expect(
      gitOutput(state, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/resources']),
    ).toBe('');
    expect(list().stdout).toBe('');
  });

  test('remove refuses a dirty worktree, exit 2, removing nothing', () => {
    create();
    writeFileSync(join(probe(), 'draft.md'), 'work');
    expect(remove()).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: resource probe is not removed: ${probe()} has uncommitted changes; keep that work first, or pass --force to discard it\n`,
    });
    expect(existsSync(join(probe(), 'draft.md'))).toBe(true);
  });

  test('remove refuses an unmerged branch, naming every reason, exit 2', () => {
    create();
    writeFileSync(join(probe(), 'c.md'), 'c');
    runGit(probe(), ['add', '-A']);
    runGit(probe(), [...identity, 'commit', '-qm', 'c']);
    expect(remove().stderr).toBe(
      `error: resource probe is not removed: the branch resources/probe holds commits HEAD of ${state} lacks; keep that work first, or pass --force to discard it\n`,
    );
    writeFileSync(join(probe(), 'draft.md'), 'work');
    expect(remove()).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: resource probe is not removed: ${probe()} has uncommitted changes, and the branch resources/probe holds commits HEAD of ${state} lacks; keep that work first, or pass --force to discard it\n`,
    });
    expect(
      gitOutput(state, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/resources']),
    ).toBe('resources/probe');
  });

  test('remove --force discards the changes and the unmerged branch', () => {
    create();
    writeFileSync(join(probe(), 'c.md'), 'c');
    runGit(probe(), ['add', '-A']);
    runGit(probe(), [...identity, 'commit', '-qm', 'c']);
    writeFileSync(join(probe(), 'draft.md'), 'work');
    expect(remove(true)).toEqual({ code: 0, stdout: 'removed probe\n', stderr: '' });
    expect(existsSync(probe())).toBe(false);
    expect(
      gitOutput(state, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/resources']),
    ).toBe('');
  });

  test('remove of an unknown resource is refused, exit 2', () => {
    expect(remove(false, 'nope')).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: no resource named nope; there are no resources\n',
    });
  });

  test('a directory with no puni.json above it fails in one line, exit 1', () => {
    const outside = scratchDirectories.createDirectory('puni-resources-none-');
    const listed = list(outside);
    expect([listed.code, listed.stdout]).toEqual([1, '']);
    expect(listed.stderr).toMatch(/^error: [^\n]*puni\.json[^\n]*; fix: [^\n]+\n$/u);
  });

  test('a repository git cannot read fails in one line, exit 1', () => {
    rmSync(join(state, '.git'), { recursive: true });
    const listed = list();
    expect([listed.code, listed.stdout]).toEqual([1, '']);
    expect(listed.stderr).toStartWith(`error: git could not list the worktrees of ${state}: `);
  });
});
