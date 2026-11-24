import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { existsSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ScratchRemovalRefused } from './failures';
import {
  createScratchDirectoryOwner,
  removeScratchDirectoriesAfterEach,
  removeScratchPath,
  resolveRemovableScratchPath,
} from './scratch-directories';

const helper = join(import.meta.dir, 'scratch-directories.ts');
const scratch = removeScratchDirectoriesAfterEach();

/** Writes `source` as a test file in a fresh owned directory and returns the file's path. */
function writeChildTest(name: string, source: string): string {
  const file = join(scratch.createDirectory('child-'), `${name}.test.ts`);
  writeFileSync(file, source);
  return file;
}

/** A child test file that creates one owned directory, prints its scratch root, then waits if told. */
const holdingChild = `
  import { test } from 'bun:test';
  import { dirname } from 'node:path';
  import { removeScratchDirectoriesAfterEach } from ${JSON.stringify(helper)};
  const scratch = removeScratchDirectoriesAfterEach();
  test('holds a scratch directory', async () => {
    const directory = scratch.createDirectory('held-');
    process.stdout.write('SCRATCH_ROOT=' + dirname(directory) + '\\n');
    if (process.env['PUNI_TEST_HOLD'] === '1') await new Promise(() => {});
  });
`;

/** Reads `stream` until a `SCRATCH_ROOT=` line arrives and returns the path it names. */
async function readScratchRoot(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let printed = '';
  for await (const chunk of stream) {
    printed += decoder.decode(chunk, { stream: true });
    const match = /^SCRATCH_ROOT=(.+)$/mu.exec(printed);
    if (match?.[1] !== undefined) return match[1];
  }
  throw new Error(`the child ended without naming its scratch root: ${printed}`);
}

describe('resolveRemovableScratchPath', () => {
  const temporaryDirectory = tmpdir();

  test.each([
    ['the empty path', ''],
    ['.', '.'],
    ['a relative path', 'libs/puni'],
    ['the file system root', '/'],
    ['the temporary directory itself', temporaryDirectory],
    ['the temporary directory with a trailing slash', `${temporaryDirectory}/`],
    [
      'a path outside it',
      resolve(temporaryDirectory, '..', 'puni-outside-the-temporary-directory'),
    ],
    ['a `..` escape', join(temporaryDirectory, 'puni-a') + '/../../etc'],
  ])('refuses %s', (_name, path) => {
    throws(() => resolveRemovableScratchPath(path), ScratchRemovalRefused);
  });

  test('refuses a path below the temporary directory that a symbolic link leads out of', () => {
    const link = join(scratch.createDirectory('link-'), 'out');
    symlinkSync(dirname(realpathSync(temporaryDirectory)), link);
    throws(() => resolveRemovableScratchPath(join(link, 'anything')), ScratchRemovalRefused);
  });

  test('accepts a directory an owner created, and removeScratchPath removes it', () => {
    const directory = scratch.createDirectory('accepted-');
    expect(resolveRemovableScratchPath(directory)).toBe(directory);
    removeScratchPath(directory);
    expect(existsSync(directory)).toBe(false);
  });
});

describe('createScratchDirectoryOwner', () => {
  test('an owner removes only its own directories, and the root goes with the last one', () => {
    const first = createScratchDirectoryOwner();
    const second = createScratchDirectoryOwner();
    const mine = first.createDirectory('mine-');
    const theirs = second.createDirectory('theirs-');
    const root = dirname(mine);
    expect(dirname(theirs)).toBe(root);
    expect(root.startsWith(join(realpathSync(tmpdir()), `puni-test-${String(process.pid)}-`))).toBe(
      true,
    );
    first.removeCreatedDirectories();
    expect([existsSync(mine), existsSync(theirs)]).toEqual([false, true]);
    second.removeCreatedDirectories();
    expect(existsSync(root)).toBe(false);
  });
});

describe('a test process using the owners', () => {
  test('a setup that throws before creating its fixture, then the teardown, removes nothing', () => {
    const workingDirectory = scratch.createDirectory('cwd-');
    writeFileSync(join(workingDirectory, 'sentinel'), 'must survive\n');
    const child = writeChildTest(
      'failed-setup',
      `
        import { beforeEach, test } from 'bun:test';
        import { join } from 'node:path';
        import { removeScratchDirectoriesAfterEach } from ${JSON.stringify(helper)};
        const scratch = removeScratchDirectoriesAfterEach();
        let root = '';
        beforeEach(() => {
          root = join(scratch.createDirectory('setup-'), 'demo');
        });
        test('uses the fixture', () => {
          process.stdout.write(root);
        });
      `,
    );
    const run = Bun.spawnSync([process.execPath, 'test', child], {
      cwd: workingDirectory,
      env: { ...process.env, TMPDIR: join(workingDirectory, 'no-such-directory') },
    });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain('TemporaryDirectoryUnresolved');
    expect(readdirSync(workingDirectory)).toEqual(['sentinel']);
  });

  test('one exiting normally leaves no scratch root behind', async () => {
    const child = Bun.spawn([process.execPath, 'test', writeChildTest('normal', holdingChild)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const root = await readScratchRoot(child.stdout);
    expect(await child.exited).toBe(0);
    expect(existsSync(root)).toBe(false);
  });

  test.each(['SIGTERM', 'SIGINT'] as const)(
    'one killed with %s leaves no scratch root behind and still ends by that signal',
    async (signal) => {
      const child = Bun.spawn([process.execPath, 'test', writeChildTest('held', holdingChild)], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PUNI_TEST_HOLD: '1' },
      });
      const root = await readScratchRoot(child.stdout);
      expect(existsSync(root)).toBe(true);
      child.kill(signal);
      await child.exited;
      expect(child.signalCode).toBe(signal);
      expect(existsSync(root)).toBe(false);
    },
  );
});
