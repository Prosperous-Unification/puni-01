import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { admissionParser } from './group';

describe('admissionParser', () => {
  test('a bare admission asks for its help', () => {
    expect(parse(admissionParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['admission'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(admissionParser, [line]).success).toBe(false);
  });
});
