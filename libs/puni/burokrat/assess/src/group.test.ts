import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { assessParser } from './group';

describe('assessParser', () => {
  test('a bare assess asks for its help', () => {
    expect(parse(assessParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['assess'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(assessParser, [line]).success).toBe(false);
  });
});
