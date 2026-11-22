import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { burokratParser, emptyGroupParser } from './root-parser';

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
    ['wiki index', { kind: 'wiki index', print: false }],
    [
      'check',
      {
        kind: 'check',
        repo: undefined,
        project: undefined,
        crossProjectLinks: false,
        staged: false,
      },
    ],
    [
      'check --project puni-dash',
      {
        kind: 'check',
        repo: undefined,
        project: 'puni-dash',
        crossProjectLinks: false,
        staged: false,
      },
    ],
    [
      'check --repo system-records',
      {
        kind: 'check',
        repo: 'system-records',
        project: undefined,
        crossProjectLinks: false,
        staged: false,
      },
    ],
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

describe('emptyGroupParser', () => {
  test('a bare group parses to an empty request', () => {
    expect(parse(emptyGroupParser, [])).toEqual({ success: true, value: {} });
  });

  test('a stray token is refused', () => {
    expect(parse(emptyGroupParser, ['stray']).success).toBe(false);
  });

  test('an unknown flag is refused', () => {
    expect(parse(emptyGroupParser, ['--bogus']).success).toBe(false);
  });
});
