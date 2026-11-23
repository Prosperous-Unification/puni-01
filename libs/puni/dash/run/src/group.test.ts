import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { runParser } from './group';

describe('runParser', () => {
  test('a bare run asks for its help', () => {
    expect(parse(runParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['run'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(runParser, [line]).success).toBe(false);
  });
});
