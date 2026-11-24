import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  ScratchPrefixRefused,
  ScratchRemovalRefused,
  TemporaryDirectoryUnresolved,
} from './failures';
import {
  createScratchDirectoryOwner,
  removeScratchDirectoriesAfterEach,
  removeScratchPath,
  resolveRemovableScratchPath,
} from './scratch-directories';

const scratchDirectoriesModulePath = join(import.meta.dir, 'scratch-directories.ts');
const scratchDirectories = removeScratchDirectoriesAfterEach();

/** The scratch roots of this process directly in the temporary directory. */
function listOwnScratchRoots(): string[] {
  return readdirSync(realpathSync(tmpdir())).filter((name) =>
    name.startsWith(`puni-test-${String(process.pid)}-`),
  );
}

/** Writes `source` as a test file in a fresh owned directory and returns the file's path. */
function writeChildTest(name: string, source: string): string {
  const file = join(scratchDirectories.createDirectory('child-'), `${name}.test.ts`);
  writeFileSync(file, source);
  return file;
}

/** A pid no process holds: that of a child that has already ended. */
function findEndedPid(): number {
  const ended = Bun.spawnSync(['true']);
  if (ended.exitCode !== 0) throw new Error('`true` did not exit 0');
  return ended.pid;
}

/**
 * A child test file that creates one owned directory, prints its scratch root, then blocks in a
 * five-second `sleep` when `PUNI_TEST_HOLD` is 1.
 */
const holdingChild = `
  import { test } from 'bun:test';
  import { dirname } from 'node:path';
  import { removeScratchDirectoriesAfterEach } from ${JSON.stringify(scratchDirectoriesModulePath)};
  const scratchDirectories = removeScratchDirectoriesAfterEach();
  test('holds a scratch directory', () => {
    const directory = scratchDirectories.createDirectory('held-');
    process.stdout.write('SCRATCH_ROOT=' + dirname(directory) + '\\n');
    if (process.env['PUNI_TEST_HOLD'] === '1') Bun.spawnSync(['sleep', '5']);
  });
`;

/** Runs `bun test` on `file` to its end with `temporaryDirectory` as its `TMPDIR`. */
function runChildTest(file: string, temporaryDirectory: string, cwd = dirname(file)) {
  const run = Bun.spawnSync([process.execPath, 'test', file], {
    cwd,
    env: { ...process.env, TMPDIR: temporaryDirectory },
    timeout: 20_000,
  });
  return { code: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() };
}

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
  ])(
    'refuses %s as not absolute, even with the working directory in a scratch root',
    (_n, path) => {
      const working = process.cwd();
      process.chdir(scratchDirectories.createDirectory('cwd-'));
      try {
        throws(() => resolveRemovableScratchPath(path), {
          name: ScratchRemovalRefused.name,
          message: /it is not an absolute path/u,
        });
      } finally {
        process.chdir(working);
      }
    },
  );

  test.each([
    ['the file system root', '/'],
    ['the temporary directory itself', temporaryDirectory],
    ['the temporary directory with a trailing slash', `${temporaryDirectory}/`],
    [
      'a path outside it',
      resolve(temporaryDirectory, '..', 'puni-outside-the-temporary-directory'),
    ],
    ['a `..` escape', join(temporaryDirectory, 'puni-a') + '/../../etc'],
    ['a directory in it that is no scratch root', join(temporaryDirectory, 'puni-checkout', 'x')],
    [
      'a path below the scratch root of another pid',
      join(temporaryDirectory, 'puni-test-1-abcdef', 'x'),
    ],
  ])('refuses %s', (_name, path) => {
    throws(() => resolveRemovableScratchPath(path), ScratchRemovalRefused);
  });

  test('refuses the scratch root itself', () => {
    const root = dirname(scratchDirectories.createDirectory('in-root-'));
    throws(() => resolveRemovableScratchPath(root), ScratchRemovalRefused);
  });

  test('refuses a path below a symbolic link that leads out of the scratch root', () => {
    const link = join(scratchDirectories.createDirectory('link-'), 'out');
    symlinkSync(dirname(realpathSync(temporaryDirectory)), link);
    throws(() => resolveRemovableScratchPath(join(link, 'anything')), ScratchRemovalRefused);
  });

  test('accepts a directory an owner created, and removeScratchPath removes it', () => {
    const directory = scratchDirectories.createDirectory('accepted-');
    expect(resolveRemovableScratchPath(directory)).toBe(directory);
    removeScratchPath(directory);
    expect(existsSync(directory)).toBe(false);
  });

  test('removeScratchPath of a symbolic link removes the link, never its target', () => {
    const target = scratchDirectories.createDirectory('target-');
    writeFileSync(join(target, 'kept.md'), 'kept\n');
    const link = join(scratchDirectories.createDirectory('holder-'), 'link');
    symlinkSync(target, link);
    removeScratchPath(link);
    expect([existsSync(link), readdirSync(target)]).toEqual([false, ['kept.md']]);
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
    expect(listOwnScratchRoots()).toEqual([root.slice(realpathSync(tmpdir()).length + 1)]);
    first.removeCreatedDirectories();
    expect([existsSync(mine), existsSync(theirs)]).toEqual([false, true]);
    second.removeCreatedDirectories();
    expect([existsSync(root), listOwnScratchRoots()]).toEqual([false, []]);
  });

  test.each(['a/b', 'a\\b', '..', 'x..y'])('refuses the prefix %j', (prefix) => {
    throws(() => createScratchDirectoryOwner().createDirectory(prefix), ScratchPrefixRefused);
  });

  test('a directory mkdtemp cannot create throws and leaves no root behind', () => {
    throws(() => createScratchDirectoryOwner().createDirectory('n'.repeat(300)), {
      code: 'ENAMETOOLONG',
    });
    expect(listOwnScratchRoots()).toEqual([]);
  });

  test('the temporary directory is read once: a later TMPDIR is not followed', () => {
    const first = scratchDirectories.createDirectory('before-');
    const named = process.env['TMPDIR'];
    process.env['TMPDIR'] = join(first, 'no-such-directory');
    try {
      const owner = createScratchDirectoryOwner();
      const second = owner.createDirectory('after-');
      owner.removeCreatedDirectories();
      expect(dirname(second)).toBe(dirname(first));
    } finally {
      if (named === undefined) delete process.env['TMPDIR'];
      else process.env['TMPDIR'] = named;
    }
  });
});

describe('a test process using the owners', () => {
  test('a setup that throws before creating its fixture, then the teardown, removes nothing', () => {
    const workingDirectory = scratchDirectories.createDirectory('cwd-');
    writeFileSync(join(workingDirectory, 'sentinel'), 'must survive\n');
    const child = writeChildTest(
      'failed-setup',
      `
        import { beforeEach, test } from 'bun:test';
        import { join } from 'node:path';
        import { removeScratchDirectoriesAfterEach } from ${JSON.stringify(scratchDirectoriesModulePath)};
        const scratchDirectories = removeScratchDirectoriesAfterEach();
        let root = '';
        beforeEach(() => {
          root = join(scratchDirectories.createDirectory('setup-'), 'demo');
        });
        test('uses the fixture', () => {
          process.stdout.write(root);
        });
      `,
    );
    const run = runChildTest(child, join(workingDirectory, 'no-such-directory'), workingDirectory);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(TemporaryDirectoryUnresolved.name);
    expect(readdirSync(workingDirectory)).toEqual(['sentinel']);
  });

  test('a relative TMPDIR is refused and writes nothing into the working directory', () => {
    const workingDirectory = scratchDirectories.createDirectory('cwd-');
    writeFileSync(join(workingDirectory, 'sentinel'), 'must survive\n');
    const run = runChildTest(writeChildTest('relative', holdingChild), '.', workingDirectory);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('cannot be resolved: it is not an absolute path');
    expect(readdirSync(workingDirectory)).toEqual(['sentinel']);
  });

  test('one exiting normally leaves no scratch root behind', () => {
    const temporaryDirectory = scratchDirectories.createDirectory('tmp-');
    const run = runChildTest(writeChildTest('normal', holdingChild), temporaryDirectory);
    expect([run.code, /^SCRATCH_ROOT=/mu.test(run.stdout)]).toEqual([0, true]);
    expect(readdirSync(temporaryDirectory)).toEqual([]);
  });

  test('one blocked in a child process dies within a second of SIGTERM, by that signal', async () => {
    const child = Bun.spawn([process.execPath, 'test', writeChildTest('held', holdingChild)], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        TMPDIR: scratchDirectories.createDirectory('tmp-'),
        PUNI_TEST_HOLD: '1',
      },
      timeout: 20_000,
    });
    await readScratchRoot(child.stdout);
    const signalled = performance.now();
    child.kill('SIGTERM');
    await child.exited;
    expect(performance.now() - signalled).toBeLessThan(1000);
    expect(child.signalCode).toBe('SIGTERM');
  });

  test('the next process sweeps the roots of ended processes and keeps those of live ones', () => {
    const temporaryDirectory = scratchDirectories.createDirectory('tmp-');
    const sleeper = Bun.spawn(['sleep', '20']);
    try {
      const ended = `puni-test-${String(findEndedPid())}-ended0`;
      const live = [
        `puni-test-${String(process.pid)}-parent`,
        `puni-test-${String(sleeper.pid)}-sleepr`,
        'puni-test-1-initpd',
        'puni-test-notapid',
      ];
      for (const name of [ended, ...live]) mkdirSync(join(temporaryDirectory, name));
      writeFileSync(join(temporaryDirectory, ended, 'left.md'), 'left by a killed run\n');
      const run = runChildTest(writeChildTest('sweeping', holdingChild), temporaryDirectory);
      expect(run.code).toBe(0);
      expect(readdirSync(temporaryDirectory).sort()).toEqual([...live].sort());
    } finally {
      sleeper.kill();
    }
  });

  test('the sweep runs once per process, not each time the root is created again', () => {
    const temporaryDirectory = scratchDirectories.createDirectory('tmp-');
    const stale = join(temporaryDirectory, `puni-test-${String(findEndedPid())}-later0`);
    const child = writeChildTest(
      'sweep-once',
      `
        import { expect, test } from 'bun:test';
        import { existsSync, mkdirSync } from 'node:fs';
        import { createScratchDirectoryOwner } from ${JSON.stringify(scratchDirectoriesModulePath)};
        test('creates the root twice', () => {
          const owner = createScratchDirectoryOwner();
          owner.createDirectory('first-');
          owner.removeCreatedDirectories();
          mkdirSync(${JSON.stringify(stale)});
          owner.createDirectory('second-');
          owner.removeCreatedDirectories();
          expect(existsSync(${JSON.stringify(stale)})).toBe(true);
        });
      `,
    );
    const run = runChildTest(child, temporaryDirectory);
    expect([run.code, run.stderr]).toMatchObject([0, expect.stringContaining('1 pass')]);
    expect(readdirSync(temporaryDirectory)).toEqual([stale.slice(temporaryDirectory.length + 1)]);
  });
});
