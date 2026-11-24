import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import type { SourceReader } from './contract';
import { SourceReadersOverlap } from './failures';
import { openSourceRegistry } from './source-registry';

/** A reader of `extensions` from `since` declaring each word of a text, counting what it reads. */
function wordReader(
  extensions: readonly string[],
  since = 1,
): SourceReader & { readonly reads: string[] } {
  const reads: string[] = [];
  const words = (text: string) => {
    reads.push(text);
    return text.split(' ');
  };
  return {
    reads,
    extensions,
    since,
    declarations: (text) =>
      words(text).map((name) => ({ name, exported: true, range: { start: 0, end: 0 } })),
    reexports: (text) => words(text),
    docComments: (text) => words(text).map((line, at) => ({ line: at + 1, text: line })),
    links: (text) => words(text).map((target) => ({ target, line: 1, resolves: true })),
  };
}

describe('openSourceRegistry', () => {
  test('picks a reader by the extension of the last segment in any case, none for any other', () => {
    const script = wordReader(['.ts', '.js']);
    const shell = wordReader(['.sh']);
    const registry = openSourceRegistry([script, shell]);
    expect(registry.extensions(1)).toEqual(['.js', '.sh', '.ts']);
    expect(registry.readerOf('libs/a.ts', 1)?.extensions).toBe(script.extensions);
    expect(registry.readerOf('libs/UP.TS', 1)?.extensions).toBe(script.extensions);
    expect(registry.readerOf('bin/run.sh', 1)?.extensions).toBe(shell.extensions);
    expect(
      ['README.md', 'libs/a.ts.md', 'Makefile', 'dir.ts/x'].map((path) =>
        registry.readerOf(path, 1),
      ),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });

  test('gives a reader only from its since', () => {
    const registry = openSourceRegistry([wordReader(['.ts'], 3), wordReader(['.sh'], 1)]);
    expect([registry.readerOf('a.ts', 2), registry.extensions(2)]).toEqual([undefined, ['.sh']]);
    expect([registry.readerOf('a.ts', 3)?.since, registry.extensions(3)]).toEqual([
      3,
      ['.sh', '.ts'],
    ]);
  });

  test('reads each text once per reading, however often it is asked', () => {
    const script = wordReader(['.ts']);
    const reader = openSourceRegistry([script]).readerOf('a.ts', 1);
    for (let round = 0; round < 3; round += 1) {
      expect(reader?.declarations('a b').map(({ name }) => name)).toEqual(['a', 'b']);
      expect(reader?.reexports('a b')).toEqual(['a', 'b']);
      expect(reader?.links('d')).toEqual([{ target: 'd', line: 1, resolves: true }]);
      expect(reader?.docComments('c')).toEqual([{ line: 1, text: 'c' }]);
    }
    expect(script.reads).toEqual(['a b', 'a b', 'd', 'c']);
  });

  test('two readers of one extension are refused, naming it, whatever its case', () => {
    throws(
      () => openSourceRegistry([wordReader(['.ts']), wordReader(['.js', '.TS'])]),
      (caught) =>
        caught instanceof SourceReadersOverlap &&
        caught.message === 'two source readers read .ts; compose one reader per extension',
    );
  });
});
