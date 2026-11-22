import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCommand } from './cli';
import { type PuniCommand, readInvocation } from './cli-parser';

function collect(run: (stdout: (text: string) => void) => unknown): string {
  let printed = '';
  run((text) => {
    printed += text;
  });
  return printed;
}

function runIn(cwd: string, command: PuniCommand): { code: 0 | 1; printed: string } {
  let code: 0 | 1 = 0;
  const printed = collect((stdout) => {
    code = runCommand(command, { cwd, stdout });
  });
  return { code, printed };
}

const repositories: string[] = [];

function makeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'puni-cli-'));
  repositories.push(root);
  writeFileSync(join(root, 'nx.json'), '{}');
  mkdirSync(join(root, 'apps/one'), { recursive: true });
  mkdirSync(join(root, 'libs'));
  writeFileSync(
    join(root, 'apps/one/project.json'),
    JSON.stringify({ name: 'one', metadata: { description: 'One.' } }),
  );
  return root;
}

afterEach(() => {
  for (const root of repositories.splice(0)) rmSync(root, { recursive: true, force: true });
});

const wikiIndex = (check: boolean): PuniCommand => ({
  group: 'burokrat',
  request: { kind: 'wiki index', check },
});

describe('runCommand', () => {
  test.each(['navigator', 'dash'] as const)(
    'a bare %s prints its group help and exits 0',
    (group) => {
      expect(runIn('.', { group, request: {} })).toEqual({
        code: 0,
        printed: collect((stdout) => readInvocation([group, '--help'], stdout)),
      });
    },
  );

  test.each(['', 'wiki'])('a bare burokrat %s prints its help and exits 0', (line) => {
    const path = line.split(' ').filter(Boolean);
    expect(runIn('.', { group: 'burokrat', request: { kind: 'help', path } })).toEqual({
      code: 0,
      printed: collect((stdout) => readInvocation(['burokrat', ...path, '--help'], stdout)),
    });
  });

  test('wiki index writes the live command tree; --check then exits 0', () => {
    const root = makeRepository();
    expect(runIn(root, wikiIndex(true)).code).toBe(1);
    expect(runIn(root, wikiIndex(false)).code).toBe(0);
    expect(readFileSync(join(root, 'wiki/index/commands.md'), 'utf8')).toContain(
      '- `puni burokrat wiki index`: ',
    );
    expect(runIn(root, wikiIndex(true))).toEqual({ code: 0, printed: 'wiki/index is current.\n' });
  });

  test('every relative link in the committed wiki index resolves', () => {
    const directory = new URL('../../../../wiki/index/', import.meta.url).pathname;
    const targets = readdirSync(directory).flatMap((name) =>
      [...readFileSync(join(directory, name), 'utf8').matchAll(/\]\(([^)]+)\)/gu)].map((link) =>
        join(dirname(join(directory, name)), link[1] ?? ''),
      ),
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !existsSync(target))).toEqual([]);
  });
});
