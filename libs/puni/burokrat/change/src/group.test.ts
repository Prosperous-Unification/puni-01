import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { changeParser } from './group';

describe('changeParser', () => {
  test('a bare change asks for its help', () => {
    expect(parse(changeParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['change'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(changeParser, [line]).success).toBe(false);
  });
});
