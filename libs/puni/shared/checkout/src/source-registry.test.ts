import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import type { SourceReader } from './contract';
import { SourceReadersOverlap } from './failures';
import { openSourceRegistry } from './source-registry';

/** A reader of `extensions` declaring each word of a text, counting the texts it reads. */
function wordReader(extensions: readonly string[]): SourceReader & { readonly reads: string[] } {
  const reads: string[] = [];
  const words = (text: string) => {
    reads.push(text);
    return text.split(' ');
  };
  return {
    reads,
    extensions,
    declarations: (text) => words(text).map((name) => ({ name, range: { start: 0, end: 0 } })),
    docComments: (text) => words(text).map((line, at) => ({ line: at + 1, text: line })),
    scope: (text) => new Set(words(text)),
  };
}

describe('openSourceRegistry', () => {
  test('picks a reader by the extension of the last segment, none for any other', () => {
    const script = wordReader(['.ts', '.js']);
    const shell = wordReader(['.sh']);
    const registry = openSourceRegistry([script, shell]);
    expect(registry.extensions).toEqual(['.js', '.sh', '.ts']);
    expect(registry.readerOf('libs/a.ts')?.extensions).toBe(script.extensions);
    expect(registry.readerOf('bin/run.sh')?.extensions).toBe(shell.extensions);
    expect(
      ['README.md', 'libs/a.ts.md', 'Makefile', 'a.TS', 'dir.ts/x'].map((path) =>
        registry.readerOf(path),
      ),
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test('reads each text once per reading, however often it is asked', () => {
    const script = wordReader(['.ts']);
    const reader = openSourceRegistry([script]).readerOf('a.ts');
    for (let round = 0; round < 3; round += 1) {
      expect(reader?.declarations('a b').map(({ name }) => name)).toEqual(['a', 'b']);
      expect(reader?.scope('a b')).toEqual(new Set(['a', 'b']));
      expect(reader?.docComments('c')).toEqual([{ line: 1, text: 'c' }]);
    }
    expect(script.reads).toEqual(['a b', 'a b', 'c']);
  });

  test('two readers of one extension are refused, naming it', () => {
    throws(
      () => openSourceRegistry([wordReader(['.ts']), wordReader(['.js', '.ts'])]),
      (caught) =>
        caught instanceof SourceReadersOverlap &&
        caught.message === 'two source readers read .ts; compose one reader per extension',
    );
  });
});
