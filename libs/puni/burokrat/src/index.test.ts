import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { burokratParser } from './index';

describe('burokratParser', () => {
  test('a bare group asks for the group help', () => {
    expect(parse(burokratParser, [])).toEqual({ success: true, value: { kind: 'help', path: [] } });
  });

  test('a bare wiki asks for the wiki help', () => {
    expect(parse(burokratParser, ['wiki'])).toEqual({
      success: true,
      value: { kind: 'help', path: ['wiki'] },
    });
  });

  test.each([
    ['wiki index', { kind: 'wiki index' }],
    ['check', { kind: 'check', repo: undefined, project: undefined }],
    ['check --project puni-dash', { kind: 'check', repo: undefined, project: 'puni-dash' }],
    ['check --repo system-records', { kind: 'check', repo: 'system-records', project: undefined }],
  ] as const)('%s parses to its leaf', (line, value) => {
    expect(parse(burokratParser, line.split(' '))).toEqual({ success: true, value });
  });

  test.each([
    'stray',
    '--bogus',
    'wiki stray',
    'wiki --bogus',
    'wiki index --check',
    'check --bogus',
    'check stray',
    'check --project',
    'check --repo system-docs',
  ])('%s is refused', (line) => {
    expect(parse(burokratParser, line.split(' ')).success).toBe(false);
  });
});
