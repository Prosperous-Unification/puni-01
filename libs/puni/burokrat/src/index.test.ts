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
    [['wiki', 'index'], false],
    [['wiki', 'index', '--check'], true],
  ])('%j parses to wiki index with check %p', (args, check) => {
    expect(parse(burokratParser, args)).toEqual({
      success: true,
      value: { kind: 'wiki index', check },
    });
  });

  test.each(['stray', '--bogus', 'wiki stray', 'wiki --bogus', 'wiki index --bogus'])(
    '%s is refused',
    (line) => {
      expect(parse(burokratParser, line.split(' ')).success).toBe(false);
    },
  );
});
