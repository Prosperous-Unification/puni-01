import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { authorityParser } from './group';

describe('authorityParser', () => {
  test('a bare authority asks for its help', () => {
    expect(parse(authorityParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['authority'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(authorityParser, [line]).success).toBe(false);
  });
});
