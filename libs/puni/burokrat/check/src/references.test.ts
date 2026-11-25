import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { join } from 'node:path';
import {
  openSourceRegistry,
  repositoryScope,
  type SourceReader,
  SourceReaderBroken,
  SourceReaderFailed,
  type SourceReading,
  SourceReadingFailed,
  SourceUnreadable,
} from '@puni/shared-checkout';
import {
  removeScratchDirectoriesAfterEach,
  removeScratchPath,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { createCheckCommand } from './check.command';
import { type CheckHost, dropRemedies, openCheckHost } from './check.test-host';
import { appliesAt, type Rule } from './finding';
import { isGeneratedFile, readAttributes } from './generated-files';
import { makeRepository, writeEpochFiles } from './repository-pair.test-host';
import { codeRules, latestRulesEpoch } from './rule-set.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { judgeDocLinks, judgeDocReferences, judgeDocSpans } from './rules/references.rule';
import { judgeSourceReading } from './rules/sources.rule';
import { judgeReadDocSymbols } from './rules/wiki.rule';

const scratchDirectories = removeScratchDirectoriesAfterEach();

/** A reading of nothing. */
const emptyReading: SourceReading = {
  declarations: [],
  reexports: [],
  docComments: [],
  links: [],
  ambient: [],
  augmented: [],
};

/** A reader of `.ts` from epoch 1 reading nothing, with no globals. */
const emptyReader: SourceReader = {
  extensions: ['.ts'],
  since: 1,
  read: () => emptyReading,
  globals: () => ({ names: new Set(), missing: [] }),
};
let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(() => {
  root = makeRepository(scratchDirectories, latestRulesEpoch);
  writeRepositoryFile(
    root,
    'src/cart.ts',
    [
      "export * from './money.js';",
      "export * from 'some-package';",
      "export * from './dir';",
      'class Base { base = 1; }',
      'export class Cart extends Base { total() { return 1; } constructor(public prop: number) { super(); } }',
      'export class Remote extends Elsewhere { own = 1; }',
      'export function renderCart() {}',
      'export namespace Pricing { export function round() {} }',
      'export const frozen = Object.freeze({ a: 1 });',
      'const hidden = 1;',
    ].join('\n'),
  );
  writeRepositoryFile(
    root,
    'src/money.ts',
    "export const formatMoney = 1;\nexport default class { inside = 1; }\nexport * from './far';\n",
  );
  writeRepositoryFile(root, 'src/far.ts', 'export const farName = 1;\n');
  writeRepositoryFile(root, 'src/dir/index.ts', 'export const fromIndex = 1;\n');
  writeRepositoryFile(root, 'src/UP.TS', 'export const Foo = 1;\n');
  writeRepositoryFile(
    root,
    'src/tool.cjs',
    '/** @typedef {Object} ToolOptions */\nexports.runTool = function () {};\nmodule.exports = { listed, other: 1 };\n',
  );
});

/** The findings of `rule` over the whole fixture, without remedies. */
function judge(rule: Rule) {
  return dropRemedies(host.judge(rule, root));
}

/** The messages of `rule` over the whole fixture. */
function messages(rule: Rule): string[] {
  return judge(rule).map(({ message }) => message);
}

/** Writes a wiki page `wiki/<name>.md` holding `body` from its line 8. */
function writePage(name: string, body: string): void {
  writeRepositoryFile(
    root,
    `wiki/${name}.md`,
    `---\ntitle: Page\nread-when: reading the page\n---\n\n# Page\n\n${body}\n`,
  );
}

describe('docs.references', () => {
  test('accepts members, inherited ones from an in-file base, modules re-exported at any remove, CommonJS and typedef names', () => {
    writePage(
      'ok',
      [
        '[a](../src/cart.ts#Cart.total), [b](../src/cart.ts#Cart.prop), [c](../src/cart.ts#Pricing.round),',
        '[d](../src/cart.ts#frozen.a), [e](../src/cart.ts#formatMoney), [f](../src/tool.cjs#runTool),',
        '[g](../src/tool.cjs#ToolOptions), [h](../src/UP.TS#Foo), [i](../src/cart.ts#hidden),',
        '[j](../src/cart.ts#Cart.base), [k](../src/cart.ts#farName), [l](../src/cart.ts#fromIndex),',
        '[m](../src/tool.cjs#listed), [n](../src/tool.cjs#other), [o](../src/cart.ts?raw#renderCart).',
      ].join('\n'),
    );
    expect(judge(judgeDocReferences)).toEqual([]);
  });

  test('judges no place fragment, empty fragment, Markdown heading, web anchor or ignored file', () => {
    writeRepositoryFile(root, '.gitignore', 'dist/\n');
    writeRepositoryFile(root, 'dist/built.ts', 'export const built = 1;\n');
    writeRepositoryFile(root, 'docs/index.html', '<h1 id="install">x</h1>\n');
    writeRepositoryFile(root, 'docs/a.markdown', '# Heading\n');
    writePage(
      'skipped',
      [
        '[a](../src/cart.ts#L10), [b](../src/cart.ts#L10-L20), [c](../src/cart.ts#), [d](../src/cart.ts#L10C5),',
        '[e](../src/cart.ts#L10-20), [f](../src/cart.ts#:~:text=cart), [g](../docs/a.markdown#nowhere),',
        '[h](skipped.md#nowhere), [i](../docs/index.html#install), [j](../dist/built.ts#gone),',
        '[k](https://example.org/a.ts#x).',
      ].join('\n'),
    );
    expect(judge(judgeDocReferences)).toEqual([]);
  });

  test('refuses what the file and its re-exports do not declare, naming the line and what it did not follow', () => {
    writePage(
      'gone',
      '[a](../src/cart.ts#default)\nand [b](../src/UP.TS#Bar), [c](../src/cart.ts#Remote.inherited), [d](../src/cart.ts#default.inside), [e](../src/UP.TS?raw#Baz).',
    );
    const unfollowed = '; it re-exports some-package, which this check does not follow';
    expect(messages(judgeDocReferences)).toEqual([
      `line 8 links to ../src/cart.ts#default, but src/cart.ts declares no default${unfollowed}`,
      'line 9 links to ../src/UP.TS#Bar, but src/UP.TS declares no Bar',
      `line 9 links to ../src/cart.ts#Remote.inherited, but src/cart.ts declares no Remote.inherited${unfollowed}`,
      `line 9 links to ../src/cart.ts#default.inside, but src/cart.ts declares no default.inside${unfollowed}`,
      'line 9 links to ../src/UP.TS#Baz, but src/UP.TS declares no Baz',
    ]);
  });

  test('refuses a missing target in a Markdown file links.resolve does not read', () => {
    for (const path of ['docs/a.mdx', 'docs/b.markdown', 'docs/C.MD', 'docs/d.md']) {
      writeRepositoryFile(root, path, '[a](gone.ts)\n');
    }
    expect(judge(judgeDocReferences)).toEqual(
      ['docs/C.MD', 'docs/a.mdx', 'docs/b.markdown'].map((path) => ({
        rule: 'docs.references',
        path,
        message: 'line 1 links to missing gone.ts',
      })),
    );
  });
});

describe('docs.references across projects and extensions', () => {
  const projects = [
    { name: 'workspace', directory: '.' },
    { name: 'lib', directory: 'lib' },
    { name: 'other', directory: 'other' },
  ];

  test('a project check follows no re-export out of its project, which the cross-project run judges', () => {
    writeRepositoryFile(root, 'lib/a.ts', "export * from '../other/b';\n");
    writeRepositoryFile(root, 'lib/c.ts', 'export const own = 1;\n');
    writeRepositoryFile(root, 'other/b.ts', 'export const fromOther = 1;\n');
    writeRepositoryFile(
      root,
      'lib/README.md',
      '[x](a.ts#fromOther), [y](a.ts#gone), [z](c.ts#nope), [w](c.ts#own).\n',
    );
    const lib = { kind: 'project', project: { name: 'lib', directory: 'lib' }, projects } as const;
    const inProject = host.judge(judgeDocReferences, root, root, lib, {
      kind: 'within-project',
      projects,
    });
    const across = host.judge(judgeDocReferences, root, root, repositoryScope, {
      kind: 'cross-project',
      projects,
    });
    expect([inProject, across].map((found) => found.map(({ message }) => message))).toEqual([
      ['line 1 links to c.ts#nope, but lib/c.ts declares no nope'],
      ['line 1 links to a.ts#gone, but lib/a.ts declares no gone'],
    ]);
  });

  test('resolves a whole re-export in the order TypeScript does: .ts, .tsx, .d.ts, then .js', () => {
    writeRepositoryFile(
      root,
      'src/order.ts',
      "export * from './m.js';\nexport * from './n';\nexport * from './p';\n",
    );
    writeRepositoryFile(root, 'src/m.ts', 'export const fromMTs = 1;\n');
    writeRepositoryFile(root, 'src/m.js', 'export const fromMJs = 1;\n');
    writeRepositoryFile(root, 'src/n.tsx', 'export const fromNTsx = 1;\n');
    writeRepositoryFile(root, 'src/n.d.ts', 'export declare const fromNDts: number;\n');
    writeRepositoryFile(root, 'src/n.js', 'export const fromNJs = 1;\n');
    writeRepositoryFile(root, 'src/p.d.ts', 'export declare const fromPDts: number;\n');
    writeRepositoryFile(root, 'src/p.js', 'export const fromPJs = 1;\n');
    const names = ['fromMTs', 'fromMJs', 'fromNTsx', 'fromNDts', 'fromNJs', 'fromPDts', 'fromPJs'];
    writePage('order', names.map((name) => `[${name}](../src/order.ts#${name})`).join(',\n'));
    expect(
      messages(judgeDocReferences).map((message) => message.split(' declares no ')[1]),
    ).toEqual(['fromMJs', 'fromNDts', 'fromNJs', 'fromPJs']);
  });
});

describe('docs.spans', () => {
  test('refuses no name no source file exports, no plain lower-case word and no generated export', () => {
    writeRepositoryFile(root, 'src/words.ts', 'export const main = 1, build = 2;\n');
    writeRepositoryFile(root, 'src/gen.ts', 'export const generatedName = 1;\n');
    writeRepositoryFile(root, '.gitattributes', 'src/gen.ts linguist-generated\n');
    writePage(
      'external',
      [
        'External: `JavaScript`, `NODE_ENV`, `useState`, `SessionStart`, `DiBag.createBuilder()`,',
        '`readWhen`, `hidden`, `Cart.nope`, `main`, `build`, `generatedName`,',
        '[`goneSymbol`](https://example.org), [`render-map.ts`](../src/cart.ts).',
      ].join('\n'),
    );
    expect(judge(judgeDocSpans)).toEqual([]);
  });

  test('accepts an exported name only as text of its typed reference, in any link form', () => {
    writePage(
      'linked',
      [
        '[`renderCart`](../src/cart.ts#renderCart), [`renderCart()`](../src/cart.ts#renderCart),',
        '[`Cart.total`][total], [the `formatMoney` value](../src/money.ts#formatMoney).',
        '',
        '<!-- `renderCart` -->',
        '',
        '    indented `renderCart`',
        '',
        '```ts',
        'renderCart();',
        '```',
        '',
        '[total]: ../src/cart.ts#Cart.total',
      ].join('\n'),
    );
    expect(judge(judgeDocSpans)).toEqual([]);
  });

  test('refuses an exported name unlinked or linked elsewhere, naming its line and declaring file, once per link', () => {
    writeRepositoryFile(root, 'src/barrel.ts', "export { renderCart as again } from './cart';\n");
    writePage(
      'stale',
      [
        'Call `renderCart()` and `Cart.total`, [`renderCart`](../src/cart.ts),',
        '[`Pricing`](linked.md), [`oldName`](../src/cart.ts#renderCart),',
        '[`Cart`](../src/cart.ts#Cart.total), [the `Cart` and `Pricing` types](../src/cart.ts#Cart).',
      ].join('\n'),
    );
    expect(messages(judgeDocSpans)).toEqual([
      'line 8 names the symbol renderCart, which src/cart.ts exports, without linking it',
      'line 8 names the symbol Cart.total, which src/cart.ts exports, without linking it',
      'line 8 names the symbol renderCart, which src/cart.ts exports, in a link to ../src/cart.ts',
      'line 9 names the symbol Pricing, which src/cart.ts exports, in a link to linked.md',
      'line 10 names the symbol Cart, which src/cart.ts exports, in a link to ../src/cart.ts#Cart.total',
      'line 10 names the symbol Pricing, which src/cart.ts exports, in a link to ../src/cart.ts#Cart',
      'line 9 links oldName to ../src/cart.ts#renderCart, a fragment naming another symbol',
    ]);
  });

  test('gives one finding for a span repeated on a line, and for a link holding two names', () => {
    writePage(
      'repeated',
      'Call `renderCart` and `renderCart` again.\n[`Cart` or `Pricing`](linked.md).',
    );
    expect(messages(judgeDocSpans)).toEqual([
      'line 8 names the symbol renderCart, which src/cart.ts exports, without linking it',
      'line 9 names the symbol Cart, which src/cart.ts exports, in a link to linked.md',
    ]);
  });

  test('lets a flag or command link to any symbol, and names no barrel passing a name on', () => {
    writeRepositoryFile(
      root,
      'src/barrel.ts',
      "export { renderCart as renderAgain } from './cart';\n",
    );
    writePage(
      'flags',
      '[`--project`](../src/cart.ts#renderCart), [`bun run gate`](../src/cart.ts#Cart), `renderAgain`.',
    );
    expect(judge(judgeDocSpans)).toEqual([]);
  });

  test('a stale typed reference whose text another file exports is one finding, of docs.references', () => {
    writeRepositoryFile(root, 'src/basket.ts', 'export function renderBasket() {}\n');
    writePage('stale', '[`renderBasket`](../src/cart.ts#renderBasket).');
    expect([judge(judgeDocSpans), messages(judgeDocReferences)]).toEqual([
      [],
      [
        'line 8 links to ../src/cart.ts#renderBasket, but src/cart.ts declares no renderBasket; it re-exports some-package, which this check does not follow',
      ],
    ]);
  });

  test('a stale typed reference is one finding of the whole check', () => {
    writeRepositoryFile(
      root,
      'wiki/one.md',
      '---\npuni-doc-type: wiki-page\ntitle: One\nread-when: reading one\n---\n\n# One\n\n[`oldName`](../src/cart.ts#oldName) and [`oldOther`](../src/cart.ts#renderCart).\n',
    );
    const lines = host
      .runCheck({}, root)
      .stdout.split('\n')
      .filter((line) => line.includes('wiki/one.md'))
      .map((line) => line.split(';')[0]);
    expect(lines).toEqual([
      'docs.references wiki/one.md: line 9 links to ../src/cart.ts#oldName, but src/cart.ts declares no oldName',
      'docs.spans wiki/one.md: line 9 links oldOther to ../src/cart.ts#renderCart, a fragment naming another symbol',
    ]);
  });

  test('judges nothing in a project check, which reads only its own files', () => {
    writePage('stale', 'Call `renderCart()`.');
    const findings = host.judge(judgeDocSpans, root, root, repositoryScope, {
      kind: 'within-project',
      projects: [],
    });
    expect(findings).toEqual([]);
  });
});

describe('the doc comments the docs rules read', () => {
  test('docs.paths judges a comment path not found from the file only from the root, naming its line, in every comment', () => {
    writeRepositoryFile(root, 'libs/x/src/sub/b.ts', 'export const b = 1;\n');
    writeRepositoryFile(root, 'sub/other.ts', 'export const other = 1;\n');
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      [
        '/** Reads `sub/b.ts` and `src/`, `refs/heads/`, `a/` and `bur/adr/`. */',
        'export const a = 1;',
        '/**',
        ' * Then',
        ' * `apps/gone.ts`.',
        ' */',
        'export const c = 1;',
      ].join('\n'),
    );
    expect(judge(judgeDocPaths)).toEqual([
      {
        rule: 'docs.paths',
        path: 'libs/x/src/a.ts',
        message: 'line 5 names the missing path apps/gone.ts',
      },
    ]);
  });

  test('a file .gitattributes marks generated or vendored is read for no comment', () => {
    const comment = '/** Runs `apps/gone.ts` and `bun run nope`. */\nexport const a = 1;\n';
    writeRepositoryFile(root, 'libs/x/src/gen.ts', comment);
    writeRepositoryFile(root, 'libs/x/vendor/v.ts', comment);
    writeRepositoryFile(root, 'libs/x/src/own.ts', comment);
    writeRepositoryFile(
      root,
      '.gitattributes',
      '*.ts text\nlibs/x/src/gen.ts linguist-generated\nlibs/x/vendor/** linguist-vendored=true\n',
    );
    for (const rule of [judgeDocPaths, judgeDocCommands]) {
      expect([rule.id, judge(rule).map(({ path }) => path)]).toEqual([
        rule.id,
        ['libs/x/src/own.ts'],
      ]);
    }
  });
});

describe('docs.paths from epoch 3', () => {
  test('takes no heading in a code block for an anchor, a fence closing only on its own character', () => {
    writePage('target', '# Real\n\n```\n~~~\n# Fake\n```');
    writePage('naming', 'See `wiki/target.md#real` and `wiki/target.md#fake`.');
    expect(messages(judgeDocPaths)).toEqual([
      'names wiki/target.md#fake, but wiki/target.md has no heading with the anchor #fake',
    ]);
  });
});

describe('docs.symbols from epoch 3', () => {
  test('finds a word in a file any reader reads, at any epoch', () => {
    writeRepositoryFile(root, 'src/later.foo', 'mySymbolName\n');
    writePage('later', 'Call `mySymbolName`.');
    const later: SourceReader = { ...emptyReader, extensions: ['.foo'], since: 99 };
    const sources = openSourceRegistry([...host.container.resolve('sourceReaders'), later]);
    expect(
      host.judge(judgeReadDocSymbols, root, root, repositoryScope, { kind: 'all' }, sources),
    ).toEqual([]);
  });
});

describe('docs.comment-links', () => {
  test('accepts a global a source file of the repository declares, and refuses what nothing declares', () => {
    writeRepositoryFile(root, 'types/env.d.ts', 'interface RepoGlobal {}\n');
    writeRepositoryFile(root, 'types/mod.d.ts', 'export interface NotGlobal {}\n');
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      '/** {@link a} */\nexport const a = 1;\n/**\n * Then\n * {@link RepoGlobal}, {@link NotGlobal}, {@link Promise} and {@link gone}.\n */\nexport const b = 1;\n',
    );
    expect(messages(judgeDocLinks)).toEqual([
      'line 5 links NotGlobal, which names nothing visible there',
      'line 5 links gone, which names nothing visible there',
    ]);
  });

  test('judges nothing in a project check, where another project may declare a global', () => {
    writeRepositoryFile(root, 'libs/x/src/a.ts', '/** {@link gone} */\nexport const a = 1;\n');
    expect(
      host.judge(judgeDocLinks, root, root, repositoryScope, {
        kind: 'within-project',
        projects: [],
      }),
    ).toEqual([]);
  });

  test('globals puni cannot read stop the judgement, named, and blame no file', () => {
    writeRepositoryFile(root, 'libs/x/src/a.ts', '/** {@link gone} */\nexport const a = 1;\n');
    const broken = new SourceReaderBroken({
      details: {
        reader: 'TypeScript',
        problem: 'the global types of bun-types are not installed beside puni',
      },
    });
    const reader: SourceReader = {
      ...emptyReader,
      read: (): SourceReading => ({
        ...emptyReading,
        docComments: [{ line: 1, text: 'x' }],
        links: [{ target: 'gone', line: 1, head: 'gone', resolved: false, memberMissing: false }],
      }),
      globals: () => {
        throw broken;
      },
    };
    throws(
      () =>
        host.judge(
          judgeDocLinks,
          root,
          root,
          repositoryScope,
          { kind: 'all' },
          openSourceRegistry([reader]),
        ),
      (caught) => caught === broken,
    );
  });

  test('a type package the repository lists but does not install is one finding of its tsconfig', () => {
    writeRepositoryFile(
      root,
      'tsconfig.json',
      '{ "compilerOptions": { "types": ["absent-types"] } }\n',
    );
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      '/** {@link gone} and {@link more} */\nexport const a = 1;\n',
    );
    writeRepositoryFile(root, 'libs/x/src/b.ts', '/** {@link other} */\nexport const b = 1;\n');
    expect(messages(judgeDocLinks).filter((message) => message.startsWith('lists'))).toEqual([
      'lists the types absent-types, which node_modules does not hold',
    ]);
    expect(judge(judgeDocLinks).filter(({ path }) => path === 'tsconfig.json')).toHaveLength(1);
  });

  test('accepts the globals of the types the repository installs', () => {
    writeRepositoryFile(root, 'node_modules/@types/jest/index.d.ts', 'declare namespace jest {}\n');
    writeRepositoryFile(root, '.gitignore', 'node_modules/\n');
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      '/** {@link jest} and {@link notJest} */\nexport const a = 1;\n',
    );
    expect(messages(judgeDocLinks)).toEqual([
      'line 1 links notJest, which names nothing visible there',
    ]);
  });
});

describe('docs.comment-links and augmentation', () => {
  test('accepts a member a module adds by a declare module resolving to the file, and none other', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/options.ts',
      'export interface Options { a: 1 }\n/** {@link Options.b} and {@link Options.c}. */\nexport const use = 1;\n',
    );
    writeRepositoryFile(
      root,
      'libs/x/src/augment.ts',
      "declare module './options' { interface Options { b: 1 } }\nexport {};\n",
    );
    expect(messages(judgeDocLinks)).toEqual([]);
    const refused = [
      'line 2 links Options.b, a member Options does not declare',
      'line 2 links Options.c, a member Options does not declare',
    ];
    for (const [file, text] of [
      ['augment.ts', 'export {};\n'],
      ['augment.ts', "declare module 'options' { interface Options { b: 1 } }\nexport {};\n"],
      ['augment.d.ts', "declare module './options' { interface Options { b: 1 } }\n"],
      ['augment.ts', "declare module './other' { interface Options { b: 1 } }\nexport {};\n"],
    ] as const) {
      removeScratchPath(join(root, 'libs/x/src/augment.ts'));
      writeRepositoryFile(root, `libs/x/src/${file}`, text);
      expect([file, text, messages(judgeDocLinks)]).toEqual([file, text, refused]);
      removeScratchPath(join(root, `libs/x/src/${file}`));
    }
  });
});

describe('sources.read', () => {
  /** A reader of `.ts` that cannot read a text starting `unreadable`, and throws `other` on one starting `defect`. */
  const failingReader = (other: Error): SourceReader => ({
    ...emptyReader,
    read(text) {
      if (text.startsWith('unreadable')) {
        throw new SourceUnreadable({ details: { reason: 'stack exhausted' } });
      }
      if (text.startsWith('defect')) throw other;
      return emptyReading;
    },
  });
  const run = (rule: Rule, reader: SourceReader) =>
    dropRemedies(
      host.judge(rule, root, root, repositoryScope, { kind: 'all' }, openSourceRegistry([reader])),
    );

  test('names each file whose text its reader cannot read, but a generated one, which the other rules then leave alone', () => {
    writeRepositoryFile(root, 'libs/x/src/bad.ts', 'unreadable\n');
    writeRepositoryFile(root, 'libs/x/src/gen.ts', 'unreadable too\n');
    writeRepositoryFile(root, '.gitattributes', 'libs/x/src/gen.ts linguist-generated\n');
    const reader = failingReader(new Error('unused'));
    expect(run(judgeSourceReading, reader)).toEqual([
      {
        rule: 'sources.read',
        path: 'libs/x/src/bad.ts',
        message: 'cannot be read as source: stack exhausted',
      },
    ]);
    expect([run(judgeDocPaths, reader), run(judgeDocLinks, reader)]).toEqual([[], []]);
  });

  test('a reader that fails otherwise, as without its compiler, stops the judgement once, blaming no file', () => {
    writeRepositoryFile(root, 'libs/x/src/one.ts', 'defect\n');
    writeRepositoryFile(root, 'libs/x/src/two.ts', 'defect\n');
    const broken = new SourceReaderBroken({
      details: {
        reader: 'TypeScript',
        problem: 'the typescript package is not installed beside puni',
      },
    });
    for (const rule of [judgeSourceReading, judgeDocPaths, judgeDocLinks]) {
      throws(
        () => run(rule, failingReader(broken)),
        (caught) => caught === broken,
      );
    }
    throws(() => run(judgeSourceReading, failingReader(new TypeError('a bug'))), TypeError);
  });

  test('a reader failing on one file names the file, as a defect of puni to report', () => {
    writeRepositoryFile(root, 'libs/x/src/one.ts', 'defect\n');
    const failed = new SourceReaderFailed({ details: { reader: 'TypeScript', problem: 'a bug' } });
    throws(
      () => run(judgeSourceReading, failingReader(failed)),
      (caught) =>
        caught instanceof SourceReadingFailed &&
        caught.message ===
          'the TypeScript source reader failed reading libs/x/src/one.ts: a bug; this is a defect of puni: report it with that file',
    );
  });

  test('the check command prints a broken reader as one error, judging nothing', () => {
    const broken = new SourceReaderBroken({
      details: {
        reader: 'TypeScript',
        problem: 'the typescript package is not installed beside puni',
      },
    });
    const command = createCheckCommand({
      repositoryCheck: {
        check: () => {
          throw broken;
        },
      },
    });
    let stdout = '';
    let stderr = '';
    const code = command.run(
      {},
      {
        cwd: root,
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    expect([code, stdout, stderr]).toEqual([
      1,
      '',
      'error: the TypeScript source reader cannot read: the typescript package is not installed beside puni; reinstall puni with its dependencies\n',
    ]);
  });
});

describe('isGeneratedFile', () => {
  /** Each case: its `.gitattributes` files by path, and the paths judged. */
  const cases: readonly (readonly [Readonly<Record<string, string>>, readonly string[]])[] = [
    [
      {
        '.gitattributes': [
          '# comment',
          '*.gen.ts linguist-generated',
          'vendor/ linguist-vendored',
          'vendored/** linguist-vendored',
          '/rooted.ts linguist-generated',
          'libs/a/**/b.ts linguist-generated=true',
          'libs/a/keep/b.ts -linguist-generated',
          'docs/*.ts linguist-vendored=false',
          'docs/back.ts !linguist-vendored',
          'x?.ts linguist-generated',
          '[ab]c.ts linguist-generated',
          '**/deep.ts linguist-generated',
        ].join('\n'),
        'pkg/.gitattributes':
          'inner.ts linguist-generated\n*.nested linguist-generated\n*.gen.ts -linguist-generated\n',
      },
      [
        'x.gen.ts',
        'deep/y.gen.ts',
        'vendor/lib/z.ts',
        'vendored/lib/z.ts',
        'libs/vendored/z.ts',
        'rooted.ts',
        'sub/rooted.ts',
        'libs/a/b.ts',
        'libs/a/c/d/b.ts',
        'libs/a/keep/b.ts',
        'docs/x.ts',
        'docs/back.ts',
        'x1.ts',
        'x12.ts',
        'ac.ts',
        'cc.ts',
        'a/b/deep.ts',
        'pkg/inner.ts',
        'inner.ts',
        'pkg/a.gen.ts',
        'pkg/b.nested',
        'other/b.nested',
        'src/x.ts',
      ],
    ],
    [{ '.gitattributes': '/** linguist-generated\n' }, ['a.ts', 'd/e/f.ts']],
    [
      {
        '.gitattributes':
          'a/** linguist-vendored\n/**/x.ts linguist-generated\ngen/ linguist-generated\n',
      },
      ['a/x.ts', 'a/b/c.ts', 'b/a/y.ts', 'a.ts', 'x.ts', 'd/e/x.ts', 'y.ts', 'gen/z.ts', 'gen'],
    ],
    [
      {
        '.gitattributes': [
          '[[:digit:]]*.ts linguist-generated',
          '[[:upper:]_]x.ts linguist-generated',
          '[!a-c]z.ts linguist-generated',
          '[]a]q.ts linguist-generated',
          '[[:alpha:][:digit:]]w.ts linguist-generated',
        ].join('\n'),
      },
      [
        '1a.ts',
        'a1.ts',
        'Ax.ts',
        '_x.ts',
        'ax.ts',
        'dz.ts',
        'az.ts',
        ']q.ts',
        'aq.ts',
        'bq.ts',
        '5w.ts',
        'bw.ts',
        '-w.ts',
      ],
    ],
    [{ '.gitattributes': '[^a]y.ts linguist-generated\n' }, ['ay.ts', 'by.ts', 'y.ts']],
    [{ '.gitattributes': '[un.ts linguist-generated\n' }, ['[un.ts', 'u.ts', 'n.ts']],
  ];

  test.each(cases.map((entry, index) => [index, ...entry] as const))(
    'agrees with git check-attr on every path of case %d',
    (_index, attributes, paths) => {
      const repository = scratchDirectories.createDirectory('puni-attributes-');
      runGit(repository, ['init', '-q']);
      for (const [path, text] of Object.entries(attributes)) {
        writeRepositoryFile(repository, path, text);
      }
      const child = Bun.spawnSync(
        ['git', 'check-attr', '--stdin', 'linguist-generated', 'linguist-vendored'],
        { cwd: repository, stdin: Buffer.from(`${paths.join('\n')}\n`) },
      );
      const byGit = new Map<string, boolean>();
      for (const line of child.stdout.toString().trim().split('\n')) {
        const [path = '', , value = ''] = line.split(': ');
        const on = value !== 'unspecified' && value !== 'unset' && value !== 'false';
        byGit.set(path, (byGit.get(path) ?? false) || on);
      }
      const files = readAttributes(
        host.container.resolve('checkoutFiles').open(repository, 'system-state'),
      );
      expect(paths.map((path) => [path, isGeneratedFile(files, path)])).toEqual(
        paths.map((path) => [path, byGit.get(path) ?? false]),
      );
    },
  );
});

describe('the epoch contract', () => {
  test('what epoch 3 refuses still passes at pin 2, and is named as newer there', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/use.ts',
      '/** Runs `apps/deploy.sh` and `bun run nope`, after {@link gone}. */\nexport const use = 1;\n',
    );
    writeRepositoryFile(
      root,
      'wiki/use.md',
      '---\ntitle: Use\nread-when: using the cart\n---\n\n# Use\n\nCall `renderCart` from [`Cart`](../src/cart.ts#Gone).\n',
    );
    writeEpochFiles(root, 2);
    const atTwo = host.runCheck({}, root);
    expect([atTwo.code, atTwo.stderr, atTwo.stdout.split('\n')[0]]).toEqual([
      0,
      '',
      `ok: system-state, ${String(codeRules.filter(({ rule }) => appliesAt(rule, 2)).length)} rules, no findings.`,
    ]);
    writeEpochFiles(root, 3);
    expect(
      host
        .runCheck({}, root)
        .stdout.split('\n')
        .map((line) => line.split(' ')[0])
        .filter((id) => id !== '' && id !== 'fail:' && id !== 'newer:'),
    ).toEqual([
      'docs.commands',
      'docs.comment-links',
      'docs.paths',
      'docs.references',
      'docs.spans',
    ]);
  });

  /**
   * Writes a page of stale names, paths, commands and links, in its prose, its front matter and
   * an HTML comment, and returns the docs and links findings of a whole check at a pin.
   */
  const writeStalePage = (): ((pin: number) => string[]) => {
    writeRepositoryFile(
      root,
      'wiki/stale.md',
      [
        '---',
        'puni-doc-type: wiki-page',
        'title: Stale',
        'read-when: reading the stale page',
        'note: see `wiki/gone-front.md`, `bun run nope-front` and `goneFrontSymbol`',
        '---',
        '',
        '# Stale',
        '',
        '<!-- `wiki/gone-comment.md`, `bun run nope-comment`, `goneCommentSymbol`, [x](gone-comment.md) -->',
        '',
        'Call `goneFunction(cart)`, `Cart.goneMember()` and `cart.goneMethod()`,',
        '[`oldName`](../src/cart.ts#renderCart) and [`goneSymbol`](../src/cart.ts).',
        '',
        '```ts',
        'goneFunction(new GoneClass());',
        '```',
      ].join('\n'),
    );
    return (pin) => {
      writeEpochFiles(root, pin);
      return host
        .runCheck({}, root)
        .stdout.split('\n')
        .filter((line) => /^(?:docs|links)\.[\w-]+ wiki\/stale\.md:/u.test(line));
    };
  };

  /**
   * The findings of `earlier` that `later` lacks: none but a `docs.symbols` one whose name a
   * finding of `later` names, as `docs.spans` names the stale text of a typed reference.
   */
  const lost = (earlier: readonly string[], later: readonly string[]): string[] =>
    earlier.filter((line) => {
      if (later.includes(line)) return false;
      const name = /^docs\.symbols [^:]+: names (\S+),/u.exec(line)?.[1];
      return name === undefined || !later.some((other) => other.includes(` ${name} `));
    });

  test.each([3, 4])('a page of stale names fails at pin %d wherever it fails at pin 2', (pin) => {
    const findings = writeStalePage();
    const atTwo = findings(2);
    const later = findings(pin);
    for (const stale of [
      'gone-front',
      'nope-front',
      'goneFrontSymbol',
      'gone-comment',
      'nope-comment',
    ]) {
      expect([stale, atTwo.some((line) => line.includes(stale))]).toEqual([stale, true]);
    }
    expect(lost(atTwo, later)).toEqual([]);
    expect(later.length).toBeGreaterThanOrEqual(atTwo.length);
  });
});
