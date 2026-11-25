import { describe, expect, test } from 'bun:test';
import { isSymbolName } from './docs';
import { listSymbolNames } from './rules/wiki.rule';

describe('isSymbolName', () => {
  test.each(['renderIndex', 'CommandExitCode', 'PUNI_FAILURE_REPORT', 'x2Y'])(
    '%s reads as a symbol',
    (word) => {
      expect(isSymbolName(word)).toBe(true);
    },
  );

  test.each(['index', 'Index', 'README', 'CLAUDECODE', 'nx', 'Parser', 'scope', 'Burokrat'])(
    '%s reads as prose',
    (word) => {
      expect(isSymbolName(word)).toBe(false);
    },
  );
});

describe('listSymbolNames', () => {
  test('reads code spans and fenced blocks, not prose', () => {
    const text = [
      'In prose renderGone is no symbol; `renderIndex(entries)` and `create<Leaf>Command` are code.',
      '',
      '```ts',
      'const host = memoryHost(tree);',
      '```',
    ].join('\n');
    expect(listSymbolNames(text)).toEqual(['renderIndex', 'memoryHost']);
  });
});
