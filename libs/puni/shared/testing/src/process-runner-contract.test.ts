import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBunProcessRunner } from '@puni/shared-adapters';
import type { ProcessRunner } from '@puni/shared-ports';
import { createMemoryProcessRunner } from './memory-host';

const exitSeven = ['sh', '-c', 'exit 7'];
const subjects: readonly (readonly [string, () => ProcessRunner])[] = [
  ['the bun adapter', createBunProcessRunner],
  ['the memory fake', () => createMemoryProcessRunner({}, { [exitSeven.join(' ')]: 7 })],
];

describe.each(subjects)('the ProcessRunner attached contract: %s', (_name, open) => {
  const runner = open();

  test('a child that exits returns its exit code', () => {
    expect(runner.runAttached(exitSeven, { cwd: tmpdir() })).toEqual({
      kind: 'exited',
      exitCode: 7,
    });
  });

  test('a program that cannot start is unstarted, not an exit', () => {
    expect(runner.runAttached(['puni-no-such-program'], { cwd: tmpdir() }).kind).toBe('unstarted');
  });
});

describe('the bun adapter run attached', () => {
  const temporaries: string[] = [];

  afterAll(() => {
    for (const directory of temporaries) rmSync(directory, { recursive: true, force: true });
  });

  test('a child a signal ended exits 128 plus the signal number', () => {
    const outcome = createBunProcessRunner().runAttached(['sh', '-c', 'kill -TERM $$'], {
      cwd: tmpdir(),
    });
    expect(outcome).toEqual({ kind: 'exited', exitCode: 143 });
  });

  test('the child reads and writes the standard streams of this process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-attached-'));
    temporaries.push(directory);
    const script = join(directory, 'attached.ts');
    const adapters = new URL('../../adapters/src/index.ts', import.meta.url).pathname;
    writeFileSync(
      script,
      [
        `import { createBunProcessRunner } from ${JSON.stringify(adapters)};`,
        "const outcome = createBunProcessRunner().runAttached(['sh', '-c', 'read line; echo \"got $line\"; echo oops >&2; exit 3'], { cwd: process.cwd() });",
        'process.exitCode = outcome.kind === "exited" ? outcome.exitCode : 99;',
      ].join('\n'),
    );
    const child = Bun.spawnSync([process.execPath, script], {
      cwd: directory,
      stdin: Buffer.from('hello\n'),
    });
    expect([child.exitCode, child.stdout.toString(), child.stderr.toString()]).toEqual([
      3,
      'got hello\n',
      'oops\n',
    ]);
  });
});
