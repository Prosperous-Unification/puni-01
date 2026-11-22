import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './cli';
import { type PuniCommand, readInvocation } from './cli-parser';

function collect(run: (stdout: (text: string) => void) => unknown): string {
  let printed = '';
  run((text) => {
    printed += text;
  });
  return printed;
}

function runIn(
  cwd: string,
  command: PuniCommand,
): { code: 0 | 1; printed: string; errors: string } {
  let code: 0 | 1 = 0;
  let errors = '';
  const printed = collect((stdout) => {
    code = runCommand(command, {
      cwd,
      stdout,
      stderr: (text) => {
        errors += text;
      },
    });
  });
  return { code, printed, errors };
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
    JSON.stringify({ name: 'one', metadata: { readWhen: 'changing one' } }),
  );
  return root;
}

afterEach(() => {
  for (const root of repositories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('runCommand', () => {
  test.each(['navigator', 'dash'] as const)(
    'a bare %s prints its group help and exits 0',
    (group) => {
      expect(runIn('.', { group, request: {} })).toEqual({
        code: 0,
        printed: collect((stdout) => readInvocation([group, '--help'], stdout)),
        errors: '',
      });
    },
  );

  test.each(['', 'wiki'])('a bare burokrat %s prints its help and exits 0', (line) => {
    const path = line.split(' ').filter(Boolean);
    expect(runIn('.', { group: 'burokrat', request: { kind: 'help', path } })).toEqual({
      code: 0,
      printed: collect((stdout) => readInvocation(['burokrat', ...path, '--help'], stdout)),
      errors: '',
    });
  });

  test('wiki index writes the live command tree into the one index file', () => {
    const root = makeRepository();
    expect(runIn(root, { group: 'burokrat', request: { kind: 'wiki index' } })).toEqual({
      code: 0,
      printed: 'wrote: wiki/index/index.md\n',
      errors: '',
    });
    const index = readFileSync(join(root, 'wiki/index/index.md'), 'utf8');
    expect(index).toContain('- changing one: [one](../../apps/one)\n');
    expect(index).toContain('- `puni burokrat check`: ');
  });

  test('wiki index refuses defective inputs with one error line and exit 1', () => {
    const root = makeRepository();
    writeFileSync(join(root, 'apps/one/project.json'), JSON.stringify({ name: 'one' }));
    expect(runIn(root, { group: 'burokrat', request: { kind: 'wiki index' } })).toEqual({
      code: 1,
      printed: '',
      errors: 'error: apps/one/project.json: project one has no metadata.readWhen\n',
    });
  });

  test('check judges with the live command tree and exits 1 on findings', () => {
    const root = makeRepository();
    const run = runIn(root, { group: 'burokrat', request: { kind: 'check' } });
    expect(run.code).toBe(1);
    expect(run.printed).toContain('agents.exists AGENTS.md: is missing\n');
    expect(run.printed).toContain('index.current wiki/index/index.md: is missing');
  });
});
