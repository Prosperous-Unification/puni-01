import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  openSourceRegistry,
  repositoryScope,
  type SourceReader,
  type SourceReading,
} from '@puni/shared-checkout';
import {
  removeScratchDirectoriesAfterEach,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { type CheckHost, dropRemedies, openCheckHost } from './check.test-host';
import { appliesAt, type Rule } from './finding';
import { isGeneratedFile } from './generated-files';
import { makeRepository, writeEpochFiles } from './repository-pair.test-host';
import { codeRules, latestRulesEpoch } from './rule-set.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { judgeDocLinks, judgeDocReferences, judgeDocSpans } from './rules/references.rule';
import { judgeSourceReading } from './rules/sources.rule';

const scratchDirectories = removeScratchDirectoriesAfterEach();
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
      '[a](../src/cart.ts#default)\nand [b](../src/UP.TS#Bar), [c](../src/cart.ts#Remote.inherited), [d](../src/cart.ts#default.inside).',
    );
    const unfollowed = '; it re-exports some-package, which this check does not follow';
    expect(messages(judgeDocReferences)).toEqual([
      `line 8 links to ../src/cart.ts#default, but src/cart.ts declares no default${unfollowed}`,
      'line 9 links to ../src/UP.TS#Bar, but src/UP.TS declares no Bar',
      `line 9 links to ../src/cart.ts#Remote.inherited, but src/cart.ts declares no Remote.inherited${unfollowed}`,
      `line 9 links to ../src/cart.ts#default.inside, but src/cart.ts declares no default.inside${unfollowed}`,
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

  test('globals that cannot be read are one finding, naming why', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      '/** {@link gone} and {@link also} */\nexport const a = 1;\n',
    );
    writeRepositoryFile(root, 'libs/x/src/b.ts', '/** {@link more} */\nexport const b = 1;\n');
    const reader: SourceReader = {
      extensions: ['.ts'],
      since: 1,
      read: (): SourceReading => ({
        declarations: [],
        reexports: [],
        docComments: [{ line: 1, text: 'x' }],
        links: [{ target: 'gone', line: 1, head: 'gone', resolved: false }],
        ambient: [],
      }),
      globals: () => {
        throw new Error('the global types of bun-types are not installed beside puni');
      },
    };
    const findings = host.judge(
      judgeDocLinks,
      root,
      root,
      repositoryScope,
      { kind: 'all' },
      openSourceRegistry([reader]),
    );
    expect(findings).toEqual([
      {
        rule: 'docs.comment-links',
        path: 'apps/one/src/index.ts',
        message:
          'line 1 links gone, but the globals cannot be read: the global types of bun-types are not installed beside puni',
        remedy: 'install puni with its dependencies, then check again',
      },
    ]);
  });
});

describe('sources.read', () => {
  test('names each file its reader cannot read, which the other rules then leave alone', () => {
    writeRepositoryFile(root, 'libs/x/src/bad.ts', 'unreadable\n');
    const reader: SourceReader = {
      extensions: ['.ts'],
      since: 1,
      read(text) {
        if (text.startsWith('unreadable')) throw new Error('stack exhausted');
        return { declarations: [], reexports: [], docComments: [], links: [], ambient: [] };
      },
      globals: () => new Set(),
    };
    const sources = openSourceRegistry([reader]);
    const run = (rule: Rule) =>
      dropRemedies(host.judge(rule, root, root, repositoryScope, { kind: 'all' }, sources));
    expect(run(judgeSourceReading)).toEqual([
      {
        rule: 'sources.read',
        path: 'libs/x/src/bad.ts',
        message: 'cannot be read as source: stack exhausted',
      },
    ]);
    expect([run(judgeDocPaths), run(judgeDocLinks)]).toEqual([[], []]);
  });
});

describe('isGeneratedFile', () => {
  const attributes = [
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
  ].join('\n');
  const nested = 'inner.ts linguist-generated\n';
  const paths = [
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
    'src/x.ts',
  ];

  test('agrees with git check-attr on every path', () => {
    const repository = scratchDirectories.createDirectory('puni-attributes-');
    runGit(repository, ['init', '-q']);
    writeRepositoryFile(repository, '.gitattributes', `${attributes}\n`);
    writeRepositoryFile(repository, 'pkg/.gitattributes', nested);
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
    const files = [
      { directory: '.', text: attributes },
      { directory: 'pkg', text: nested },
    ];
    expect(paths.map((path) => [path, isGeneratedFile(files, path)])).toEqual(
      paths.map((path) => [path, byGit.get(path) ?? false]),
    );
  });
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
        .filter((id) => id !== '' && id !== 'fail:'),
    ).toEqual([
      'docs.commands',
      'docs.comment-links',
      'docs.paths',
      'docs.references',
      'docs.spans',
      'docs.spans',
    ]);
  });

  test('a page of stale names fails at pin 3 wherever it fails at pin 2', () => {
    writePage(
      'stale',
      [
        'Call `goneFunction(cart)`, `Cart.goneMember()` and `cart.goneMethod()`,',
        '[`oldName`](../src/cart.ts#renderCart) and [`goneSymbol`](../src/cart.ts).',
        '',
        '```ts',
        'goneFunction(new GoneClass());',
        '```',
      ].join('\n'),
    );
    const findings = (pin: number) => {
      writeEpochFiles(root, pin);
      return host
        .runCheck({}, root)
        .stdout.split('\n')
        .filter((line) => line.startsWith('docs.'));
    };
    const atTwo = findings(2);
    const atThree = findings(3);
    expect(atTwo.length).toBeGreaterThan(0);
    expect(atTwo.filter((line) => !atThree.includes(line))).toEqual([]);
    expect(atThree.length).toBeGreaterThan(atTwo.length);
  });
});
