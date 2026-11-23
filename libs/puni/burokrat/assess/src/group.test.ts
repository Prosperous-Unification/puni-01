import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { assessParser } from './group';

const period = '--since 2026-11-22T00:00:00Z --until 2026-11-24T00:00:00Z';

describe('assessParser', () => {
  test('a bare assess asks for its help', () => {
    expect(parse(assessParser, [])).toEqual({
      success: true,
      value: { kind: 'help', path: ['assess'] },
    });
  });

  test.each([
    [
      `outcomes ${period}`,
      { rateCard: undefined, claudeProjects: [], codexSessions: [], json: false },
    ],
    [
      `outcomes ${period} --rate-card c.json --claude-projects a --claude-projects b --codex-sessions c --json`,
      { rateCard: 'c.json', claudeProjects: ['a', 'b'], codexSessions: ['c'], json: true },
    ],
  ] as const)('%s parses', (line, rest) => {
    expect(parse(assessParser, line.split(' '))).toEqual({
      success: true,
      value: {
        kind: 'assess outcomes',
        since: '2026-11-22T00:00:00Z',
        until: '2026-11-24T00:00:00Z',
        ...rest,
      },
    });
  });

  test.each([
    'stray',
    '--bogus',
    'outcomes',
    'outcomes --since 2026-11-22T00:00:00Z',
    `outcomes ${period} --rate-card`,
    `outcomes ${period} stray`,
  ])('%s is refused', (line) => {
    expect(parse(assessParser, line.split(' ')).success).toBe(false);
  });
});
