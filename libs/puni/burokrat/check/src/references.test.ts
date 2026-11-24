import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { repositoryScope } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach, writeRepositoryFile } from '@puni/shared-testing';
import { type CheckHost, dropRemedies, openCheckHost } from './check.test-host';
import { appliesAt, type Rule } from './finding';
import { isGeneratedFile } from './generated-files';
import { makeRepository, writeEpochFiles } from './repository-pair.test-host';
import { codeRules, latestRulesEpoch } from './rule-set.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { judgeDocLinks, judgeDocReferences, judgeDocSpans } from './rules/references.rule';

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
      "export * from './money';",
      "export * from 'some-package';",
      'export class Cart { total() { return 1; } constructor(public prop: number) {} }',
      'export function renderCart() {}',
      'export namespace Pricing { export function round() {} }',
      'export const frozen = Object.freeze({ a: 1 });',
      'const hidden = 1;',
    ].join('\n'),
  );
  writeRepositoryFile(
    root,
    'src/money.ts',
    'export const formatMoney = 1;\nexport default formatMoney;\n',
  );
  writeRepositoryFile(root, 'src/UP.TS', 'export const Foo = 1;\n');
  writeRepositoryFile(
    root,
    'src/tool.cjs',
    '/** @typedef {Object} ToolOptions */\nexports.runTool = function () {};\n',
  );
});

/** The findings of `rule` over the whole fixture, without remedies. */
function judge(rule: Rule) {
  return dropRemedies(host.judge(rule, root));
}

/** Writes a wiki page `wiki/<name>.md` holding `body`. */
function writePage(name: string, body: string): void {
  writeRepositoryFile(
    root,
    `wiki/${name}.md`,
    `---\ntitle: Page\nread-when: reading the page\n---\n\n# Page\n\n${body}\n`,
  );
}

describe('docs.references', () => {
  test('accepts members, a module re-exported one hop, CommonJS and @typedef names', () => {
    writePage(
      'ok',
      [
        '[a](../src/cart.ts#Cart.total), [b](../src/cart.ts#Cart.prop), [c](../src/cart.ts#Pricing.round),',
        '[d](../src/cart.ts#frozen.a), [e](../src/cart.ts#formatMoney), [f](../src/tool.cjs#runTool),',
        '[g](../src/tool.cjs#ToolOptions), [h](../src/UP.TS#Foo), [i](../src/cart.ts#hidden).',
      ].join('\n'),
    );
    expect(judge(judgeDocReferences)).toEqual([]);
  });

  test('judges no line anchor, empty fragment, Markdown heading, web anchor or ignored file', () => {
    writeRepositoryFile(root, '.gitignore', 'dist/\n');
    writeRepositoryFile(root, 'dist/built.ts', 'export const built = 1;\n');
    writeRepositoryFile(root, 'docs/index.html', '<h1 id="install">x</h1>\n');
    writeRepositoryFile(root, 'docs/a.markdown', '# Heading\n');
    writeRepositoryFile(root, 'docs/a.mdx', '# Heading\n');
    writePage(
      'skipped',
      [
        '[a](../src/cart.ts#L10), [b](../src/cart.ts#L10-L20), [c](../src/cart.ts#),',
        '[d](../docs/a.markdown#nowhere), [e](../docs/a.mdx#nowhere), [f](skipped.md#nowhere),',
        '[g](../docs/index.html#install), [h](../dist/built.ts#gone), [i](https://example.org/a.ts#x).',
      ].join('\n'),
    );
    expect(judge(judgeDocReferences)).toEqual([]);
  });

  test('reads the links of every Markdown file, .markdown and .mdx too', () => {
    writeRepositoryFile(root, 'docs/a.mdx', '[a](../src/UP.TS#Gone)\n');
    writeRepositoryFile(root, 'docs/b.markdown', '[b](../src/UP.TS#Gone)\n');
    expect(judge(judgeDocReferences).map(({ path }) => path)).toEqual([
      'docs/a.mdx',
      'docs/b.markdown',
    ]);
  });

  test('refuses a name the file and its re-exports do not declare, saying what it did not follow', () => {
    writePage('gone', '[a](../src/cart.ts#default) and [b](../src/UP.TS#Bar).');
    expect(judge(judgeDocReferences)).toEqual([
      {
        rule: 'docs.references',
        path: 'wiki/gone.md',
        message:
          'links to ../src/cart.ts#default, but src/cart.ts declares no default; it re-exports some-package, which this check does not follow',
      },
      {
        rule: 'docs.references',
        path: 'wiki/gone.md',
        message: 'links to ../src/UP.TS#Bar, but src/UP.TS declares no Bar',
      },
    ]);
  });
});

describe('docs.spans', () => {
  test('refuses no name that no source file exports', () => {
    writePage(
      'external',
      [
        'External: `JavaScript`, `TypeScript`, `GitHub`, `macOS`, `NODE_ENV`, `useState`, `SessionStart`,',
        '`DiBag.createBuilder()`, `readWhen`, `onClick`, `forEach`, `toString()`, `snake_case_name`,',
        '`hidden`, `Cart.nope`, [`goneSymbol`](https://example.org), [`render-map.ts`](../src/cart.ts).',
      ].join('\n'),
    );
    expect(judge(judgeDocSpans)).toEqual([]);
  });

  test('accepts an exported name only as the text of its typed reference, in any link form', () => {
    writePage(
      'linked',
      [
        '[`renderCart`](../src/cart.ts#renderCart), [`renderCart()`](../src/cart.ts#renderCart),',
        '[`Cart.total`][total], [`formatMoney`](../src/money.ts#formatMoney).',
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

  test('refuses an exported name unlinked or linked elsewhere, and text naming another symbol than its fragment', () => {
    writePage(
      'stale',
      [
        'Call `renderCart()` and `Cart.total`, [`renderCart`](../src/cart.ts),',
        '[`Pricing`](linked.md), [`oldName`](../src/cart.ts#renderCart) and [`Cart`](../src/cart.ts#Cart.total).',
      ].join('\n'),
    );
    expect(judge(judgeDocSpans).map(({ message }) => message)).toEqual([
      'names the symbol renderCart, which src/cart.ts exports, without linking it',
      'names the symbol Cart.total, which src/cart.ts exports, without linking it',
      'links the symbol renderCart, which src/cart.ts exports, to ../src/cart.ts',
      'links the symbol Pricing, which src/cart.ts exports, to linked.md',
      'links oldName to ../src/cart.ts#renderCart, a fragment naming another symbol',
      'links the symbol Cart, which src/cart.ts exports, to ../src/cart.ts#Cart.total',
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
  test('docs.paths judges a comment path only from the root, naming its line, in every comment', () => {
    writeRepositoryFile(root, 'libs/x/src/sub/b.ts', 'export const b = 1;\n');
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
    const comment =
      '/** Runs `apps/gone.ts` and `bun run nope`, after {@link gone}. */\nexport const a = 1;\n';
    writeRepositoryFile(root, 'libs/x/src/gen.ts', comment);
    writeRepositoryFile(root, 'libs/x/vendor/v.ts', comment);
    writeRepositoryFile(root, 'libs/x/src/own.ts', comment);
    writeRepositoryFile(
      root,
      '.gitattributes',
      '*.ts text\nlibs/x/src/gen.ts linguist-generated\nlibs/x/vendor/ linguist-vendored=true\n',
    );
    for (const rule of [judgeDocPaths, judgeDocCommands, judgeDocLinks]) {
      expect([rule.id, judge(rule).map(({ path }) => path)]).toEqual([
        rule.id,
        ['libs/x/src/own.ts'],
      ]);
    }
  });

  test('docs.comment-links judges every comment and names the line of the link', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/a.ts',
      '/** {@link a} */\nexport const a = 1;\n/**\n * Then\n * {@link b} and {@link gone}.\n */\nexport const b = 1;\n',
    );
    expect(judge(judgeDocLinks)).toEqual([
      {
        rule: 'docs.comment-links',
        path: 'libs/x/src/a.ts',
        message: 'line 5 links gone, which names nothing visible there',
      },
    ]);
  });
});

describe('isGeneratedFile', () => {
  const attributes = [
    '# comment',
    '*.gen.ts linguist-generated',
    'vendor/ linguist-vendored',
    'libs/a/**/b.ts linguist-generated=true',
    'libs/a/keep/b.ts -linguist-generated',
    'docs/*.ts linguist-vendored=false',
  ].join('\n');
  test.each([
    ['x.gen.ts', true],
    ['deep/y.gen.ts', true],
    ['vendor/lib/z.ts', true],
    ['libs/vendor/z.ts', true],
    ['libs/a/b.ts', true],
    ['libs/a/c/d/b.ts', true],
    ['libs/a/keep/b.ts', false],
    ['docs/x.ts', false],
    ['src/x.ts', false],
  ])('%s is generated: %p', (path, expected) => {
    expect(isGeneratedFile(attributes, path)).toBe(expected);
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
        .filter((id) => id !== '' && id !== 'fail:' && id !== 'newer:'),
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
