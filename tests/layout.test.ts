import { describe, expect, test } from 'bun:test';

const root = new URL('../', import.meta.url).pathname;

/** Every file git shows under `directory`, tracked or untracked and not ignored. */
function listVisible(directory: string): string[] {
  const child = Bun.spawnSync(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', directory],
    { cwd: root },
  );
  if (child.exitCode !== 0) throw new Error(`git ls-files failed: ${child.stderr.toString()}`);
  return child.stdout
    .toString()
    .split('\0')
    .filter((path) => path !== '');
}

const isTest = (path: string) => /\.test(-host)?\.ts$/u.test(path);

describe('where code may live', () => {
  test('the app holds only its five wiring files besides tests', () => {
    const source = listVisible('apps/puni/cli/src').filter((path) => !isTest(path));
    expect(source.map((path) => path.replace('apps/puni/cli/src/', '')).sort()).toEqual([
      'composition.check.ts',
      'composition.ts',
      'entrypoint.ts',
      'main.ts',
      'root-parser.ts',
    ]);
  });

  test('every code file of a library lives in its src directory', () => {
    const code = listVisible('libs').filter((path) => /\.[cm]?[jt]s$/u.test(path));
    expect(code.length).toBeGreaterThan(0);
    expect(code.filter((path) => !/^libs\/[^/]+\/[^/]+\/[^/]+\/src\//u.test(path))).toEqual([]);
  });
});
