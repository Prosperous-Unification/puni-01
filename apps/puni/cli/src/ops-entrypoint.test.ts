import { beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

/**
 * A fake `ssh` that writes its arguments, NUL-separated, to `$PUNI_FAKE_SSH_LOG`, copies its
 * standard input to its standard output, and exits `$PUNI_FAKE_SSH_EXIT`.
 */
const fakeSsh = [
  '#!/bin/sh',
  'printf \'%s\\0\' "$@" > "$PUNI_FAKE_SSH_LOG"',
  'cat',
  'exit "${PUNI_FAKE_SSH_EXIT:-0}"',
  '',
].join('\n');

describe('dash ops through the entrypoint, demo beside demo-records, a fake ssh on PATH', () => {
  let state = '';
  let bin = '';
  let log = '';

  beforeEach(() => {
    state = makeStateRepository(scratchDirectories);
    const parent = dirname(state);
    const records = join(parent, 'demo-records');
    mkdirSync(join(records, 'dash/ops'), { recursive: true });
    writeFileSync(
      join(records, 'dash/ops/nodes.json'),
      JSON.stringify({
        nodes: [
          { name: 'alpha', ssh: 'alpha-alias', roles: ['k3s-server'] },
          { name: 'beta', ssh: 'beta-alias', roles: [] },
        ],
      }),
    );
    bin = join(parent, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'ssh'), fakeSsh);
    chmodSync(join(bin, 'ssh'), 0o755);
    log = join(parent, 'ssh.log');
  });

  function runPuni(
    args: readonly string[],
    exit = 0,
    path = `${bin}:${process.env['PATH'] ?? ''}`,
  ) {
    const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
      cwd: state,
      stdin: Buffer.from('typed\n'),
      env: {
        ...process.env,
        CLAUDECODE: '0',
        AGENT: '0',
        PATH: path,
        PUNI_FAKE_SSH_LOG: log,
        PUNI_FAKE_SSH_EXIT: String(exit),
      },
    });
    return {
      code: child.exitCode,
      stdout: child.stdout.toString(),
      stderr: child.stderr.toString(),
    };
  }

  function readArguments(): string[] {
    return readFileSync(log, 'utf8').split('\0').slice(0, -1);
  }

  test('ssh NODE -- COMMAND runs ssh with the quoted command and returns its exit code', () => {
    expect(runPuni(['dash', 'ops', 'ssh', 'beta', '--', 'sh', '-c', 'exit 7'], 7)).toEqual({
      code: 7,
      stdout: 'typed\n',
      stderr: '',
    });
    expect(readArguments()).toEqual(['beta-alias', '--', "'sh'", "'-c'", "'exit 7'"]);
  });

  test('ssh NODE alone opens a shell attached to this terminal', () => {
    expect(runPuni(['d', 'ops', 'ssh', 'alpha'])).toEqual({
      code: 0,
      stdout: 'typed\n',
      stderr: '',
    });
    expect(readArguments()).toEqual(['alpha-alias']);
  });

  test('k3s forwards every argument, flags included, to k3s kubectl on the server', () => {
    const run = runPuni(['d', 'ops', 'k3s', 'get', 'pods', '-n', 'kube-system', '-o', 'wide'], 255);
    expect(run.code).toBe(255);
    expect(readArguments()).toEqual([
      'alpha-alias',
      '--',
      ...['k3s', 'kubectl', 'get', 'pods', '-n', 'kube-system', '-o', 'wide'].map(
        (word) => `'${word}'`,
      ),
    ]);
  });

  test('an unknown node is exit 2 with the known names, and ssh never runs', () => {
    expect(runPuni(['d', 'ops', 'ssh', 'nope', '--', 'true'])).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: no node named nope; the nodes are alpha, beta\n',
    });
    expect(existsSync(log)).toBe(false);
  });

  test('k3s with no arguments is a usage refusal, exit 2', () => {
    expect(runPuni(['d', 'ops', 'k3s'])).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: Expected a `KUBECTL_ARG`, but too few arguments.\n',
    });
  });

  test('an ssh missing from PATH is one error line and exit 1', () => {
    const run = runPuni(['d', 'ops', 'ssh', 'alpha'], 0, join(dirname(state), 'empty'));
    expect([run.code, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^error: ssh could not start: [^\n]+\n$/u);
  });
});
