import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { mcpParser } from './group';

describe('mcpParser', () => {
  test('a bare mcp asks for its help', () => {
    expect(parse(mcpParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['mcp'] },
    });
  });

  test.each(['stray', '--bogus'])('%s is refused', (line) => {
    expect(parse(mcpParser, [line]).success).toBe(false);
  });
});
