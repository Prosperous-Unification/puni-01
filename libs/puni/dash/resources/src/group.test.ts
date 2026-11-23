import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { resourcesParser } from './group';

describe('resourcesParser', () => {
  test('a bare resources asks for its help', () => {
    expect(parse(resourcesParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['resources'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(resourcesParser, [line]).success).toBe(false);
  });
});
