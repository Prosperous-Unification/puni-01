import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { progressParser } from './group';

describe('progressParser', () => {
  test('a bare progress asks for its help', () => {
    expect(parse(progressParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['progress'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(progressParser, [line]).success).toBe(false);
  });
});
