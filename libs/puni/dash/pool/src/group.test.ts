import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { poolParser } from './group';

describe('poolParser', () => {
  test('a bare pool asks for its help', () => {
    expect(parse(poolParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['pool'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(poolParser, [line]).success).toBe(false);
  });
});
