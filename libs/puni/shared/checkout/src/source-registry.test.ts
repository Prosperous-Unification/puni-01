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
  return {
    reads,
    extensions,
    since,
    read(text) {
      reads.push(text);
      if (text === 'unreadable') throw new Error('cannot read');
      const words = text.split(' ');
      return {
        declarations: words.map((name) => ({
          name,
          exported: true,
          reexported: false,
          range: { start: 0, end: 0 },
        })),
        reexports: [],
        docComments: [],
        links: [],
        ambient: words,
      };
    },
    globals(root) {
      reads.push(`globals ${root}`);
      return { names: new Set([`Global${root}`]), missing: [] };
    },
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

  test('reads each text once, and the globals once for each root, however often it is asked', () => {
    const script = wordReader(['.ts']);
    const reader = openSourceRegistry([script]).readerOf('a.ts', 1);
    for (let round = 0; round < 3; round += 1) {
      expect(reader?.read('a b').ambient).toEqual(['a', 'b']);
      expect(reader?.read('c').ambient).toEqual(['c']);
      expect(reader?.globals('/r')).toEqual({ names: new Set(['Global/r']), missing: [] });
      expect(reader?.globals('/s').names).toEqual(new Set(['Global/s']));
    }
    expect(script.reads).toEqual(['a b', 'c', 'globals /r', 'globals /s']);
  });

  test('a text that cannot be read throws again on every ask, read once', () => {
    const script = wordReader(['.ts']);
    const reader = openSourceRegistry([script]).readerOf('a.ts', 1);
    for (let round = 0; round < 2; round += 1) {
      throws(() => reader?.read('unreadable'), /cannot read/u);
    }
    expect(script.reads).toEqual(['unreadable']);
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
