import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { fixtureRemotes } from '@puni/shared-testing';
import { RegistryInvalid } from './failures';
import { formatRegistry, parseRegistry, repinRegistry } from './registry';

describe('formatRegistry', () => {
  test('writes the rules epoch, which parseRegistry reads back', () => {
    expect(
      parseRegistry(formatRegistry('system-state', fixtureRemotes, 3), '/r/puni.json').rules,
    ).toBe(3);
  });
});

describe('repinRegistry', () => {
  test('sets the rules epoch, keeping every other key in its order, as two-space JSON', () => {
    const text = formatRegistry('system-state', fixtureRemotes, 1).replace('{', '{"x-first":[1],');
    const repinned = repinRegistry(text, '/r/puni.json', 2);
    expect(repinned.endsWith('}\n')).toBe(true);
    expect(repinned).toStartWith(
      '{\n  "x-first": [\n    1\n  ],\n  "this-repo-type": "system-state",\n  "rules": 2,\n  "all-repos": [\n',
    );
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
