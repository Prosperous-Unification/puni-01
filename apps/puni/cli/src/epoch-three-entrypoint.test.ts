import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRulesSection } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { epochThreeAdded, makeEpochThreePair } from './epoch-three.test-host';

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

/** The finding lines of `stdout`, each as `<rule> <path>` and its `fix:`. */
function readFindings(stdout: string): { readonly at: string; readonly remedy: string }[] {
  return stdout.split('\n').flatMap((line) => {
    const match = /^([a-z]+\.[a-z-]+ [^:]+): .*?; fix: (.*)$/u.exec(line);
    return match === null ? [] : [{ at: match[1] ?? '', remedy: match[2] ?? '' }];
  });
}

const mapLine = '- starting work on demo: [Start](wiki/start.md)';

/**
 * A repository pinned at epoch 3 keeps the verdict the puni of epoch 3 gave it until it upgrades:
 * here the one `repo init` made then, with a wiki page, a guide and a record added, no Markdown
 * file declaring a document type.
 */
describe('a repository as repo init made it at rules epoch 3', () => {
  test('passes both checks and prints its map unchanged', () => {
    const { state } = makeEpochThreePair(scratchDirectories, readRules());
    const check = runPuni(['burokrat', 'check'], state);
    expect([check.code, check.stderr]).toEqual([0, '']);
    expect(check.stdout).toMatch(
      /^ok: system-state, \d+ rules, no findings\.\nnewer: puni\.json pins rules epoch 3; [^\n]*docs\.type[^\n]*\n$/u,
    );
    const records = runPuni(['burokrat', 'check', '--repo', 'system-records'], state);
    expect([records.code, records.stdout.split('\n')[0]]).toEqual([
      0,
      'ok: system-records, 13 rules, no findings.',
    ]);
    const map = runPuni(['burokrat', 'wiki', 'map'], state);
    expect([map.code, map.stdout.split('\n').includes(mapLine)]).toEqual([0, true]);
  });

  test('upgrades to 4: repo upgrade declares the entry files, the remedies name the rest', () => {
    const { state, records } = makeEpochThreePair(scratchDirectories, readRules());
    const refused = runPuni(['burokrat', 'repo', 'upgrade'], state);
    expect(refused.code).toBe(1);
    expect(readFindings(refused.stdout)).toEqual([
      {
        at: 'docs.type docs/guide.md',
        remedy:
          'open it with front matter declaring it: a --- line, "puni-doc-type: <type>", a --- line (or that line first in the front matter it has), the type here being product',
      },
      {
        at: 'docs.type wiki/start.md',
        remedy:
          'open it with front matter declaring it: a --- line, "puni-doc-type: <type>", a --- line (or that line first in the front matter it has), the type here being wiki-page',
      },
    ]);
    expect(readFileSync(join(state, 'AGENTS.md'), 'utf8')).toStartWith('# demo\n');
    writeFileSync(join(state, 'docs/guide.md'), `---\npuni-doc-type: product\n---\n\n# Guide\n`);
    const page = epochThreeAdded.state['wiki/start.md'] ?? '';
    writeFileSync(
      join(state, 'wiki/start.md'),
      page.replace('---\n', '---\npuni-doc-type: wiki-page\n'),
    );
    expect(runPuni(['burokrat', 'repo', 'upgrade'], state)).toEqual({
      code: 0,
      stdout: 'upgraded: rules epoch 3 -> 4\n',
      stderr: '',
    });
    expect(
      [join(state, 'AGENTS.md'), join(state, 'README.md'), join(records, 'AGENTS.md')].map((path) =>
        readFileSync(path, 'utf8').split('\n').slice(0, 4).join('\n'),
      ),
    ).toEqual([
      '---\npuni-doc-type: agents\n---\n',
      '---\npuni-doc-type: readme\n---\n',
      '---\npuni-doc-type: agents\n---\n',
    ]);
    const record = 'nav/plans/2031-04-05-first-plan.md';
    expect(readFileSync(join(records, record), 'utf8')).toBe(epochThreeAdded.records[record] ?? '');
    for (const args of [
      ['burokrat', 'check'],
      ['burokrat', 'check', '--repo', 'system-records'],
    ]) {
      const check = runPuni(args, state);
      expect(check.code).toBe(0);
      expect(check.stdout).toMatch(/^ok: [^\n]+\n$/u);
    }
    const map = runPuni(['burokrat', 'wiki', 'map'], state);
    expect([map.code, map.stdout.split('\n').includes(mapLine)]).toEqual([0, true]);
  });
});
