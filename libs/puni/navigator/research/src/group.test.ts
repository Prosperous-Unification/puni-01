import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { researchParser } from './group';

describe('researchParser', () => {
  test('a bare research asks for its help', () => {
    expect(parse(researchParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['research'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(researchParser, [line]).success).toBe(false);
  });
});
