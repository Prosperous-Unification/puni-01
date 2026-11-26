import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRulesSection } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach, runGit } from '@puni/shared-testing';
import { makeEpochOnePair } from './epoch-one.test-host';

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

/** The rules section of this checkout's `AGENTS.md`, which `repo init` copies. */
function readRules(): string {
  const rules = readRulesSection(readFileSync(join(checkout, 'AGENTS.md'), 'utf8'));
  if (rules === undefined) throw new Error('AGENTS.md has no rules section');
  return rules;
}

/** Every `fix:` of `stdout`'s finding lines, by rule id. */
function readRemedies(stdout: string): Map<string, string> {
  const pairs: [string, string][] = [];
  for (const line of stdout.split('\n')) {
    const match = /^([a-z]+\.[a-z-]+) [^:]+: .*?; fix: (.*)$/u.exec(line);
    if (match !== null) pairs.push([match[1] ?? '', match[2] ?? '']);
  }
  return new Map(pairs);
}

/**
 * A repository pinned at epoch 1 keeps the verdict the puni of epoch 1 gave it until it upgrades:
 * here the one `repo init` made then, its generated `wiki/index` committed and named by its
 * entry files.
 */
describe('a repository as repo init made it at rules epoch 1', () => {
  test('passes the check and prints its map unchanged', () => {
    const state = makeEpochOnePair(scratchDirectories, readRules());
    const check = runPuni(['burokrat', 'check'], state);
    expect([check.code, check.stderr]).toEqual([0, '']);
    expect(check.stdout).toMatch(/^ok: system-state, \d+ rules, no findings\.\nnewer: /u);
    expect(runPuni(['burokrat', 'wiki', 'map'], state)).toEqual({
      code: 0,
      stdout: '# Wiki map\n',
      stderr: '',
    });
  });

  test('upgrades to the latest epoch, 4, once its findings are fixed as their remedies say', () => {
    const state = makeEpochOnePair(scratchDirectories, readRules());
    const refused = runPuni(['burokrat', 'repo', 'upgrade'], state);
    expect(refused.code).toBe(1);
    const remedies = readRemedies(refused.stdout);
    expect([...remedies.keys()]).toEqual(['agents.index', 'docs.type', 'index.leftover']);
    expect(refused.stdout).not.toMatch(/^docs\.type (?!wiki\/index\/)/mu);
    expect(remedies.get('index.leftover')).toBe(
      'run `git rm -r wiki/index`, then replace each `wiki/index/index.md` in AGENTS.md and README.md with `puni burokrat wiki map`',
    );
    expect(remedies.get('agents.index')).toStartWith(
      'replace `wiki/index/index.md` in AGENTS.md with `puni burokrat wiki map`',
    );
    runGit(state, ['rm', '-r', '-q', 'wiki/index']);
    for (const file of ['AGENTS.md', 'README.md']) {
      const path = join(state, file);
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replaceAll('`wiki/index/index.md`', '`puni burokrat wiki map`'),
      );
    }
    expect(runPuni(['burokrat', 'repo', 'upgrade'], state)).toEqual({
      code: 0,
      stdout: 'upgraded: rules epoch 1 -> 4\n',
      stderr: '',
    });
    const check = runPuni(['burokrat', 'check'], state);
    expect(check.code).toBe(0);
    expect(check.stdout).toMatch(/^ok: [^\n]+\n$/u);
  });
});
