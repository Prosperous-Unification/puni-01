import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { SourceReader } from '@puni/shared-checkout';
import { closeAfterEach } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { typescriptModule } from './module';
import { typescriptReadersSince } from './source-readers.resource';
import { createTypescriptCompiler } from './typescript-compiler.repository';

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

/** The names `text` declares, read as a file of `extension`, sorted. */
function declared(text: string, extension = '.ts'): string[] {
  return readerOf(extension)
    .declarations(text)
    .map(({ name }) => name)
    .sort();
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
  test('read TypeScript, TSX, JavaScript and JSX, each extension once, from epoch 3', () => {
    const all = readers();
    expect(all.flatMap((reader) => reader.extensions).sort()).toEqual(
      ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'].sort(),
    );
    expect(new Set(all.map(({ since }) => since))).toEqual(new Set([typescriptReadersSince]));
    expect(typescriptReadersSince).toBe(3);
  });

  test('declare top-level names, exported names and the members of exported shapes', () => {
    expect(declared(source)).toEqual(
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

  test('declare namespaces, parameter properties, class expressions, frozen objects and merged shapes', () => {
    const text = [
      'class Base { base = 1; }',
      'export class Cart extends Base {',
      '  static staticOne = 1;',
      '  constructor(public prop: number, plain: number) { super(); }',
      '  total(): number { return 1; }',
      '}',
      'export namespace Pricing { export function round(n: number) { return n; } export namespace Deep {} const no = 1; }',
      'export interface Merged { a: number }',
      'export interface Merged { b: number }',
      'export function Fn() {}',
      'export namespace Fn { export const helper = 1; }',
      'export const frozen = Object.freeze({ a: 1 });',
      'export const Klass = class { method() {} };',
      'export type Union = { u: 1 } | { v: 2 };',
      'class local { m() {} }',
      'export { local as renamedOut };',
      'export default class {}',
      'declare const ambient: number;',
      'declare global { interface Glob {} }',
    ].join('\n');
    const names = declared(text);
    for (const name of [
      'Cart.staticOne',
      'Cart.prop',
      'Cart.total',
      'Pricing.round',
      'Pricing.Deep',
      'Merged.a',
      'Merged.b',
      'Fn.helper',
      'frozen.a',
      'Klass.method',
      'Union.u',
      'Union.v',
      'renamedOut.m',
      'default',
      'ambient',
      'Glob',
    ]) {
      expect([name, names.includes(name)]).toEqual([name, true]);
    }
    for (const name of ['Cart.plain', 'Cart.constructor', 'Cart.base', 'Pricing.no', 'local.m']) {
      expect([name, names.includes(name)]).toEqual([name, false]);
    }
  });

  test('declare an import by `=`, and no default for an `export =`', () => {
    expect(declared("import eq = require('./other');\nconst value = 1;\nexport = value;")).toEqual([
      'eq',
      'value',
    ]);
  });

  test('declare what CommonJS exports and what a @typedef or @callback names', () => {
    const text = [
      '/** @typedef {Object} ToolOptions */',
      '/** @callback Visit */',
      'function helper() {}',
      'exports.runTool = function () {};',
      'module.exports.other = 1;',
      'something.exports.no = 1;',
    ].join('\n');
    expect(declared(text, '.cjs')).toEqual(['ToolOptions', 'Visit', 'helper', 'other', 'runTool']);
  });

  test('give each declaration the range of its text, its doc comment excluded', () => {
    const declarations = readerOf('.ts').declarations(source);
    const textOf = (name: string) => {
      const found = declarations.find((declaration) => declaration.name === name);
      return found === undefined ? undefined : source.slice(found.range.start, found.range.end);
    };
    expect(textOf('answer')).toBe('answer = 42');
    expect(textOf('parse')).toBe('export function parse(text: string): string { return text; }');
    expect(textOf('Shape.area')).toBe('readonly area: number;');
    expect(textOf('renamed')).toBe('other as renamed');
  });

  test('name the modules a file re-exports whole, not those it re-exports by name', () => {
    expect(readerOf('.ts').reexports(source)).toEqual(['./everything']);
  });

  test('list every doc comment with the line of its first text, markers stripped, and no other comment', () => {
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
      "const text = '/** not a comment */';",
      '/**/',
      '/** At the end. */',
    ].join('\n');
    expect(readerOf('.ts').docComments(text)).toEqual([
      { line: 2, text: 'Opens `libs/a.ts`.\n\n@example\n```ts\nopen();\n```' },
      { line: 10, text: 'An inner note.' },
      { line: 18, text: 'At the end.' },
    ]);
  });

  test('read JSX in .tsx, .jsx and .js files, and no comment in JSX text', () => {
    const view = 'export const View = () => <p>/** {@link Gone} `libs/gone.ts` */</p>;';
    for (const extension of ['.tsx', '.jsx', '.js']) {
      expect([extension, declared(view, extension), readerOf(extension).links(view)]).toEqual([
        extension,
        ['View'],
        [],
      ]);
    }
    expect(declared('/** Doubles. */\nexport function double(x) { return x * 2; }', '.js')).toEqual(
      ['double'],
    );
    const attributed = 'export const v = <a href="x">{1}</a>, after = 2;';
    for (const extension of ['.js', '.jsx', '.tsx']) {
      expect([extension, declared(attributed, extension)]).toEqual([extension, ['after', 'v']]);
    }
  });
});

/** The links of `text` as a `.ts` file, each as `<target> <resolves>`. */
function links(text: string): string[] {
  return readerOf('.ts')
    .links(text)
    .map(({ target, line, resolves }) => `${String(line)} ${target} ${String(resolves)}`);
}

const linking = [
  "import { join } from 'node:path';",
  "import type { Other } from './other';",
  "import def, * as nsAll from './other';",
  "import eq = require('./other');",
  'export interface Options<T> { value: T }',
  'export enum Colour { Red }',
  'declare global { interface Window { shop: number } }',
  '/** @typedef {Object} Shaped */',
  '',
  '/**',
  ' * Globals: {@link Promise}, {@link Error}, {@link JSON.parse}, {@link process.exitCode}, {@link Bun.spawn},',
  ' * {@link globalThis}, {@link NodeJS.Timeout}, {@link Window}, {@link Shaped}.',
  ' * Ok: {@link join}, {@link Other}, {@link def}, {@link nsAll.x}, {@link eq}, {@link Colour.Red}.',
  ' * Forms: {@link Options | the options}, {@linkcode Options the options}, {@linkplain',
  ' * Options}, {@link Options#value}, {@link Options<string>}, {@link Options.}.',
  ' * Skipped: {@link module:other}, {@link ./other.ts}, {@link import(x)}, {@link #value}, {@link}.',
  ' * In code: `{@link InBackticks}`.',
  ' * @param options the {@link options} and {@link T}',
  ' * @see {@link SeeLink}',
  ' * ```ts',
  ' * {@link InFence}',
  ' * ```',
  ' */',
  'export function run<T>(options: Options<T>): T {',
  '  /** Local {@link inner}, {@link options} and {@linkcode Gone}. */',
  '  const inner = options.value;',
  '  return inner;',
  '}',
  '',
  'export class Box {',
  '  size = 1;',
  '  /** Members {@link size}, {@link Box.size}, {@link this.size}, {@link Box#size}, {@link Box.nope}, {@link this.nope}. */',
  '  open(): void {}',
  '}',
  '/* {@link NotDoc} */',
  '// {@link NotDocEither}',
].join('\n');

describe('the links of the TypeScript readers', () => {
  test('resolve as the compiler does: scopes, members, imports, the file, the globals', () => {
    const read = links(linking);
    const resolving = read
      .filter((line) => line.endsWith(' true'))
      .map((line) => line.split(' ')[1]);
    const refused = read.filter((line) => line.endsWith(' false'));
    expect(refused).toEqual([
      '19 SeeLink false',
      '25 Gone false',
      '32 Box.nope false',
      '32 this.nope false',
    ]);
    expect(resolving).toEqual([
      'Promise',
      'Error',
      'JSON.parse',
      'process.exitCode',
      'Bun.spawn',
      'globalThis',
      'NodeJS.Timeout',
      'Window',
      'Shaped',
      'join',
      'Other',
      'def',
      'nsAll.x',
      'eq',
      'Colour.Red',
      'Options',
      'Options',
      'Options',
      'Options#value',
      'Options<string>',
      'Options.',
      'options',
      'T',
      'inner',
      'options',
      'size',
      'Box.size',
      'this.size',
      'Box#size',
    ]);
  });

  test('give each link the line its tag opens on', () => {
    expect(
      links('/**\n * One {@link A}\n * then {@link\n * B}.\n */\nexport const A = 1, B = 2;'),
    ).toEqual(['2 A true', '3 B true']);
  });

  test('accept any member of a shape the file cannot list whole', () => {
    expect(
      links(
        [
          'class Base { base = 1; }',
          '/** {@link Sub.base}, {@link Spread.any}, {@link Typed.any} and {@link Shut.any}. */',
          'export class Sub extends Base {}',
          'export const Spread = { ...{ a: 1 } };',
          'export const Typed: { any: 1 } = make();',
          'export const Shut = { a: 1 };',
        ].join('\n'),
      ),
    ).toEqual(['2 Sub.base true', '2 Spread.any true', '2 Typed.any true', '2 Shut.any false']);
  });
});

describe('the TypeScript compiler', () => {
  test('is the version package.json pins exactly', () => {
    const root = new URL('../../../../../package.json', import.meta.url);
    const { dependencies } = JSON.parse(readFileSync(root, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(dependencies['@typescript/old']).toBe(
      `npm:typescript@${createTypescriptCompiler().load().version}`,
    );
  });

  test('reads the global declarations once, the same texts on every call', () => {
    const compiler = createTypescriptCompiler();
    const texts = compiler.globalDeclarationTexts();
    expect(texts.length).toBeGreaterThan(10);
    expect(compiler.globalDeclarationTexts()).toBe(texts);
    expect(compiler.load()).toBe(compiler.load());
  });
});
