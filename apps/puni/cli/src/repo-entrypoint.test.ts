import { beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { readRulesSection } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import cliPackage from '../package.json' with { type: 'json' };

const scratchDirectories = removeScratchDirectoriesAfterEach();

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;
const checkout = new URL('../../../../', import.meta.url).pathname;

function runPuni(args: readonly string[], cwd: string) {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return { code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

describe('burokrat repo init through the entrypoint, in an empty temporary directory', () => {
  let parent = '';
  let state = '';
  let records = '';

  beforeEach(() => {
    parent = scratchDirectories.createDirectory('puni-repo-init-');
    state = join(parent, 'shop');
    records = join(parent, 'shop-records');
    mkdirSync(state);
  });

  test('creates a pair that both checks pass once each is a git repository', () => {
    const init = runPuni(['burokrat', 'repo', 'init', '--name', 'shop', '--owner', 'acme'], state);
    expect([init.code, init.stderr]).toEqual([0, '']);
    expect(init.stdout).toStartWith(
      `created system-state ${state}\ncreated system-records ${records}\nnext: create https://github.com/acme/shop and https://github.com/acme/shop-records (private) on GitHub, then:\n`,
    );
    expect(readRulesSection(readFileSync(join(state, 'AGENTS.md'), 'utf8'))).toBe(
      readRulesSection(readFileSync(join(checkout, 'AGENTS.md'), 'utf8')),
    );
    for (const root of [state, records]) {
      expect([
        lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink(),
        readlinkSync(join(root, 'CLAUDE.md')),
      ]).toEqual([true, 'AGENTS.md']);
    }
    runGit(state, ['init', '-q']);
    runGit(records, ['init', '-q']);
    expect(runPuni(['burokrat', 'check'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-state, 29 rules, no findings.\n',
      stderr: '',
    });
    expect(runPuni(['burokrat', 'check', '--repo', 'system-records'], state)).toEqual({
      code: 0,
      stdout: 'ok: system-records, 13 rules, no findings.\n',
      stderr: '',
    });
  });

  test('a new pair is pinned at the latest rules: upgrade has nothing to do; a later pin is refused', () => {
    expect(
      runPuni(['burokrat', 'repo', 'init', '--name', 'shop', '--owner', 'acme'], state).code,
    ).toBe(0);
    runGit(state, ['init', '-q']);
    const pinned = readFileSync(join(state, 'puni.json'), 'utf8');
    const { rules } = JSON.parse(pinned) as { rules: number };
    expect(runPuni(['burokrat', 'repo', 'upgrade'], state)).toEqual({
      code: 0,
      stdout: `ok: rules epoch ${String(rules)} is already the latest this puni knows\n`,
      stderr: '',
    });
    writeFileSync(
      join(state, 'puni.json'),
      pinned.replace(`"rules":${String(rules)}`, '"rules":99'),
    );
    const refusal = `error: puni.json pins rules epoch 99, but puni ${cliPackage.version} knows rules only up to epoch ${String(rules)}; upgrade puni\n`;
    for (const args of [['check'], ['repo', 'upgrade']]) {
      expect(runPuni(['burokrat', ...args], state)).toEqual({
        code: 2,
        stdout: '',
        stderr: refusal,
      });
    }
  });

  test('the owner defaults to the owner of the checkout puni runs from', () => {
    const owner = JSON.parse(readFileSync(join(checkout, 'puni.json'), 'utf8')) as {
      'all-repos': { remote: { url: string } }[];
    };
    const url = owner['all-repos'][0]?.remote.url ?? '';
    const init = runPuni(['burokrat', 'repo', 'init', '--name', 'shop'], state);
    expect(init.code).toBe(0);
    expect(init.stdout).toContain(`next: create ${url.replace(/[^/]+$/u, 'shop')} and `);
  });

  test('a directory holding anything but .git is refused, exit 2, and nothing is created', () => {
    writeFileSync(join(state, 'notes.md'), 'mine\n');
    expect(runPuni(['burokrat', 'repo', 'init', '--name', 'shop'], state)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: ${state} holds notes.md; a new repository starts in an empty directory, where only .git may exist\n`,
    });
    expect(existsSync(records)).toBe(false);
    expect(readdirSync(state)).toEqual(['notes.md']);
  });

  test('an existing records directory is refused, exit 2, and the empty directory stays empty', () => {
    mkdirSync(records);
    runGit(state, ['init', '-q']);
    expect(runPuni(['burokrat', 'repo', 'init', '--name', 'shop'], state)).toEqual({
      code: 2,
      stdout: '',
      stderr: `error: ${records} already exists; a new repository goes where nothing is\n`,
    });
    expect(readdirSync(state)).toEqual(['.git']);
    expect(readdirSync(records)).toEqual([]);
  });
});
