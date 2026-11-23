import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { repoParser } from './group';

describe('repoParser', () => {
  test('a bare repo asks for its help', () => {
    expect(parse(repoParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['repo'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(repoParser, [line]).success).toBe(false);
  });
});
