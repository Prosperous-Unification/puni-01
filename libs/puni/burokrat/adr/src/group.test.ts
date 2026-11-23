import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { adrParser } from './group';

describe('adrParser', () => {
  test('a bare adr asks for its help', () => {
    expect(parse(adrParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['adr'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(adrParser, [line]).success).toBe(false);
  });
});
