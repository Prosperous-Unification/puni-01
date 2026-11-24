import { describe, expect, test } from 'bun:test';
import type { SourceReader } from '@puni/shared-checkout';
import { closeAfterEach } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { typescriptModule } from './module';

const track = closeAfterEach();

function readers(): readonly SourceReader[] {
  const container = track(
    DiBag.createBuilder().withInstalledModules([typescriptModule]).buildContainer(),
  );
  return container.resolve('typescriptSourceReaders');
}

function readerOf(extension: string): SourceReader {
  const found = readers().find(({ extensions }) => extensions.includes(extension));
  if (found === undefined) throw new Error(`no reader reads ${extension}`);
  return found;
}

const source = [
  "import base, { join as joinPath, type Kind } from './base';",
  "import * as all from './all';",
  "export { named, other as renamed } from './named';",
  "export * as grouped from './grouped';",
  "export * from './everything';",
  '',
  '/** The answer. */',
  'export const answer = 42;',
  'const hidden = 1, { left, right: [first] } = pair();',
  'export const table = { alpha: 1, beta() {}, "gamma": 2 } as const;',
  'export function parse(text: string): string { return text; }',
  'function helper() {}',
  'export class Box { size = 1; open(): void {} #secret = 2; get label() { return ""; } }',
  'export interface Shape { readonly area: number; scale(by: number): Shape }',
  'interface Private { field: string }',
  'export type Pair = { left: number; right: number };',
  'export type Alias = string;',
  'export enum Colour { Red, Green }',
  'export { helper, hidden as shown };',
  'export default parse;',
].join('\n');

describe('the TypeScript source readers', () => {
  test('read TypeScript, TSX, JavaScript and JSX, each extension once', () => {
    const extensions = readers().flatMap((reader) => reader.extensions);
    expect(extensions.sort()).toEqual(
      ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'].sort(),
    );
  });

  test('declare top-level names, exported names and the members of exported shapes', () => {
    const names = readerOf('.ts')
      .declarations(source)
      .map(({ name }) => name);
    expect(names.sort()).toEqual(
      [
        'answer',
        'hidden',
        'left',
        'first',
        'table',
        'table.alpha',
        'table.beta',
        'table.gamma',
        'parse',
        'helper',
        'Box',
        'Box.size',
        'Box.open',
        'Box.label',
        'Shape',
        'Shape.area',
        'Shape.scale',
        'Private',
        'Pair',
        'Pair.left',
        'Pair.right',
        'Alias',
        'Colour',
        'Colour.Red',
        'Colour.Green',
        'named',
        'renamed',
        'grouped',
        'helper',
        'shown',
        'default',
      ].sort(),
    );
  });

  test('give each declaration the range of its text, its doc comment excluded', () => {
    const declared = readerOf('.ts').declarations(source);
    const textOf = (name: string) => {
      const found = declared.find((declaration) => declaration.name === name);
      return found === undefined ? undefined : source.slice(found.range.start, found.range.end);
    };
    expect(textOf('answer')).toBe('answer = 42');
    expect(textOf('parse')).toBe('export function parse(text: string): string { return text; }');
    expect(textOf('Shape.area')).toBe('readonly area: number;');
    expect(textOf('renamed')).toBe('other as renamed');
  });

  test('put the top-level names and the imports in scope, not the re-exports', () => {
    const scope = readerOf('.ts').scope(source);
    for (const name of ['base', 'joinPath', 'Kind', 'all', 'answer', 'helper', 'Private']) {
      expect([name, scope.has(name)]).toEqual([name, true]);
    }
    for (const name of ['join', 'named', 'renamed', 'grouped', 'default', 'Box.size']) {
      expect([name, scope.has(name)]).toEqual([name, false]);
    }
  });

  test('list every doc comment with its first line, markers stripped, and no other comment', () => {
    const text = [
      '/**',
      ' * Opens `libs/a.ts`.',
      ' *',
      ' * @example',
      ' * ```ts',
      ' * open();',
      ' * ```',
      ' */',
      'export function open() {',
      '  /** An inner note. */',
      '  const x = 1;',
      '  /* a block comment */',
      '  // a line comment',
      '  return x;',
      '}',
      'const pattern = /\\/** not a comment/u;',
      '/**/',
      '/** At the end. */',
    ].join('\n');
    expect(readerOf('.ts').docComments(text)).toEqual([
      { line: 1, text: 'Opens `libs/a.ts`.\n\n@example\n```ts\nopen();\n```' },
      { line: 10, text: 'An inner note.' },
      { line: 18, text: 'At the end.' },
    ]);
  });

  test('read JSX in a .tsx file and plain JavaScript in a .js file', () => {
    expect(
      readerOf('.tsx')
        .declarations('export const View = () => <div>{1}</div>;')
        .map(({ name }) => name),
    ).toEqual(['View']);
    expect(
      readerOf('.js')
        .declarations('/** Doubles. */\nexport function double(x) { return x * 2; }')
        .map(({ name }) => name),
    ).toEqual(['double']);
  });
});
