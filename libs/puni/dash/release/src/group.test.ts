import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { releaseParser } from './group';

describe('releaseParser', () => {
  test('a bare release asks for its help', () => {
    expect(parse(releaseParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['release'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(releaseParser, [line]).success).toBe(false);
  });
});
