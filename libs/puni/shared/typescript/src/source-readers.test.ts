import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SourceReader } from '@puni/shared-checkout';
import { closeAfterEach } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { typescriptModule } from './module';
import { typescriptReadersSince } from './source-readers.resource';
import { GlobalTypesMissing } from './failures';
import {
  createTypescriptCompiler,
  globalTypePackages,
  openTypescriptCompiler,
} from './typescript-compiler.repository';

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
    .read(text)
    .declarations.map(({ name }) => name)
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
      'Cart.base',
    ]) {
      expect([name, names.includes(name)]).toEqual([name, true]);
    }
    for (const name of ['Cart.plain', 'Cart.constructor', 'Pricing.no', 'local.m']) {
      expect([name, names.includes(name)]).toEqual([name, false]);
    }
  });

  test('declare an import by `=`, and no default for an `export =`', () => {
    expect(declared("import eq = require('./other');\nconst value = 1;\nexport = value;")).toEqual([
      'eq',
      'value',
    ]);
  });

  test('declare what module.exports assigns, and a typedef only of JavaScript at tag position', () => {
    expect(declared('module.exports = { a, b: 1, c() {} };', '.cjs')).toEqual(['a', 'b', 'c']);
    const tags =
      '/** @typedef {Object} Tagged\n * Not at tag position: @typedef Prose */\nexport const x = 1;';
    expect([declared(tags, '.js'), declared(tags, '.ts')]).toEqual([['Tagged', 'x'], ['x']]);
  });

  test('inherit the members of a base declared in the file, closed only when it is', () => {
    const text = [
      'class Base { base = 1; }',
      'export class Sub extends Base { own = 1; }',
      'export class Far extends Elsewhere { own = 1; }',
      'export interface Both extends Shape, Base { b: 1 }',
      'interface Shape { area: number }',
    ].join('\n');
    expect(declared(text).filter((name) => name.includes('.'))).toEqual([
      'Both.area',
      'Both.b',
      'Both.base',
      'Far.own',
      'Sub.base',
      'Sub.own',
    ]);
  });

  test('read a deeply nested expression without exhausting the stack', () => {
    const deep = `/** Sums {@link gone}. */\nexport const sum = ${Array.from({ length: 8000 }, () => '1').join(' + ')};`;
    const reading = readerOf('.ts').read(deep);
    expect([reading.declarations.map(({ name }) => name), reading.links.length]).toEqual([
      ['sum'],
      1,
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
    const { declarations } = readerOf('.ts').read(source);
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
    expect(readerOf('.ts').read(source).reexports).toEqual(['./everything']);
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
    expect(readerOf('.ts').read(text).docComments).toEqual([
      { line: 2, text: 'Opens `libs/a.ts`.\n\n@example\n```ts\nopen();\n```' },
      { line: 10, text: 'An inner note.' },
      { line: 18, text: 'At the end.' },
    ]);
  });

  test('read JSX in .tsx, .jsx and .js files, and no comment in JSX text', () => {
    const view = 'export const View = () => <p>/** {@link Gone} `libs/gone.ts` */</p>;';
    for (const extension of ['.tsx', '.jsx', '.js']) {
      expect([extension, declared(view, extension), readerOf(extension).read(view).links]).toEqual([
        extension,
        ['View'],
        [],
      ]);
    }
    expect(declared('/** Doubles. */\nexport function double(x) { return x * 2; }', '.js')).toEqual(
      ['double'],
    );
    const jsxText = 'export const Note = () => (\n  <p>\n    /** see `libs/gone.ts` */\n  </p>\n);';
    for (const extension of ['.tsx', '.jsx']) {
      expect([extension, readerOf(extension).read(jsxText).docComments]).toEqual([extension, []]);
    }
    const attributed = 'export const v = <a href="x">{1}</a>, after = 2;';
    for (const extension of ['.js', '.jsx', '.tsx']) {
      expect([extension, declared(attributed, extension)]).toEqual([extension, ['after', 'v']]);
    }
  });
});

/**
 * The links of `text` as a file of `extension`, each as `<line> <target> <resolves>`, a link the
 * file does not resolve resolving when its head is a global.
 */
function links(text: string, extension = '.ts'): string[] {
  const reader = readerOf(extension);
  return reader
    .read(text)
    .links.map(
      ({ target, line, head, resolved }) =>
        `${String(line)} ${target} ${String(resolved || reader.globals().has(head))}`,
    );
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
      '12 Shaped false',
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

  test('resolve a name declared anywhere in the file, at any depth', () => {
    const text = [
      'export namespace Outer { export namespace Ns { export const v = 1; } }',
      'export const run = (arrowParam: number) => {',
      '  for (const loopVar of [1]) { void loopVar; }',
      '  try { void 0; } catch (caughtErr) { void caughtErr; }',
      '  return { method(objectParam: number) { return objectParam; } };',
      '};',
      'export interface Typed { handler: (signatureParam: string) => void }',
      '/**',
      ' * {@link arrowParam}, {@link loopVar}, {@link caughtErr}, {@link objectParam},',
      ' * {@link signatureParam}, {@link Ns}, {@link Ns.anything}, {@link run.name}, {@link run.call}.',
      ' */',
      'export const after = 1;',
    ].join('\n');
    expect(links(text).filter((line) => !line.endsWith(' true'))).toEqual([]);
  });

  test('take no URL, module path, file path or anchor for a name', () => {
    expect(
      links(
        '/** {@link https://a.b/c}, {@link module:x}, {@link ./x.ts}, {@link #v}, {@link Gone:x}. */\nexport const a = 1;',
      ),
    ).toEqual([]);
  });

  test('check members only of a top-level shape the file closes, a function or class having those of every function', () => {
    const text = [
      'export function Fn() {}',
      'export class Klass { m() {} }',
      'export type Open = { a: 1 } | Other;',
      'export type Shut = { a: 1 } | { b: 2 };',
      'export const shadowed = { a: 1 };',
      'function local(shadowed: { z: 1 }) { return shadowed; }',
      '/**',
      ' * {@link Fn.call}, {@link Klass.prototype}, {@link Klass.name}, {@link Open.any},',
      ' * {@link Shut.b}, {@link Shut.c}, {@link shadowed.z}, {@link Fn.nope}.',
      ' */',
      'export const after = local;',
    ].join('\n');
    expect(links(text).filter((line) => line.endsWith(' false'))).toEqual([
      '9 Shut.c false',
      '9 Fn.nope false',
    ]);
  });

  test('take a global only from the libraries or a global block, not a module top level', () => {
    expect(
      links(
        [
          "declare module 'shop' { global { interface FromModule {} } }",
          'declare global { interface FromGlobal {} }',
          '/** {@link FromModule}, {@link FromGlobal}, {@link ReadableStream}, {@link NotGlobalAnywhere}. */',
          'export const a = 1;',
        ].join('\n'),
      ),
    ).toEqual([
      '3 FromModule true',
      '3 FromGlobal true',
      '3 ReadableStream true',
      '3 NotGlobalAnywhere false',
    ]);
    const module = readerOf('.ts').read('export interface Exported {}\ninterface Local {}');
    const script = readerOf('.ts').read('interface Scripted {}\ndeclare const value: number;');
    expect([module.ambient, script.ambient]).toEqual([[], ['Scripted', 'value']]);
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

  test('refuses, naming the package, global types that are not installed', () => {
    throws(
      () => openTypescriptCompiler(['no-such-global-types']).globalDeclarationTexts(),
      (caught) =>
        caught instanceof GlobalTypesMissing &&
        caught.message ===
          'the global types of no-such-global-types are not installed beside puni; reinstall puni with its dependencies',
    );
    expect(globalTypePackages).toEqual(['bun-types']);
  });

  test('reads the global declarations once, the same texts on every call', () => {
    const compiler = createTypescriptCompiler();
    const texts = compiler.globalDeclarationTexts();
    expect(texts.length).toBeGreaterThan(10);
    expect(compiler.globalDeclarationTexts()).toBe(texts);
    expect(compiler.load()).toBe(compiler.load());
  });
});
