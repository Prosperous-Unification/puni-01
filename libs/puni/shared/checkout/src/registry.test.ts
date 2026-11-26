import { afterAll, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureRemotes } from '@puni/shared-testing';
import { RegistryInvalid } from './failures';
import { formatJson } from './json-format';
import { formatRegistry, parseRegistry, repinRegistry } from './registry';

const workspace = new URL('../../../../../', import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), 'puni-json-format-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('formatRegistry', () => {
  test('writes the rules epoch, which parseRegistry reads back', () => {
    expect(
      parseRegistry(formatRegistry('system-state', fixtureRemotes, 3), '/r/puni.json').rules,
    ).toBe(3);
  });
});

describe('repinRegistry', () => {
  test('sets the rules epoch, keeping every other key in its order', () => {
    const text = formatRegistry('system-state', fixtureRemotes, 1).replace('{', '{"x-first":[1],');
    const repinned = repinRegistry(text, '/r/puni.json', 2);
    expect(repinned).toStartWith(
      '{\n  "x-first": [1],\n  "this-repo-type": "system-state",\n  "rules": 2,\n  "all-repos": [\n    {\n',
    );
    expect(repinned).toEndWith('\n  ]\n}\n');
    expect(parseRegistry(repinned, '/r/puni.json')).toEqual({
      ...parseRegistry(text, '/r/puni.json'),
      rules: 2,
    });
  });

  test('an invalid registry is refused as parseRegistry refuses it', () => {
    throws(
      () => repinRegistry('{}', '/r/puni.json', 2),
      (caught) => caught instanceof RegistryInvalid,
    );
  });
});

const longWords = Array.from({ length: 12 }, (_, index) => `word-number-${String(index)}`);

describe('formatJson', () => {
  const layouts: readonly (readonly [string, unknown, string])[] = [
    ['empty containers', { a: [], b: {} }, '{\n  "a": [],\n  "b": {}\n}\n'],
    ['a short array of numbers', { 'x-a': [1, 2] }, '{\n  "x-a": [1, 2]\n}\n'],
    ['a short array of strings', { 'x-a': ['p', 'q'] }, '{\n  "x-a": ["p", "q"]\n}\n'],
    ['short nested arrays', { 'x-a': [[1], [2, 3]] }, '{\n  "x-a": [[1], [2, 3]]\n}\n'],
    [
      'an array holding an object',
      { 'x-a': [{ b: true }] },
      '{\n  "x-a": [\n    {\n      "b": true\n    }\n  ]\n}\n',
    ],
    [
      'an array of strings past the width',
      { 'x-a': longWords },
      `{\n  "x-a": [\n${longWords.map((word) => `    "${word}"`).join(',\n')}\n  ]\n}\n`,
    ],
  ];

  test.each(layouts)('lays out %s', (_name, value, text) => {
    expect(formatJson(value)).toBe(text);
  });

  test('every layout it supports, and a repinned registry, pass bun fmt --check', () => {
    const files = layouts.map(([, value], index) => {
      const file = join(scratch, `layout-${String(index)}.json`);
      writeFileSync(file, formatJson(value));
      return file;
    });
    const registry = join(scratch, 'puni.json');
    writeFileSync(
      registry,
      repinRegistry(
        formatRegistry('system-state', fixtureRemotes, 1).replace('{', '{"x-tags":["a","b"],'),
        registry,
        2,
      ),
    );
    const check = Bun.spawnSync([process.execPath, 'fmt', '--check', ...files, registry], {
      cwd: workspace,
      env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
    });
    expect([check.exitCode, check.stderr.toString()]).toEqual([0, '']);
  });
});
