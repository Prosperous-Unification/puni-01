import { describe, expect, test } from 'bun:test';
import { isMarkdown, type MarkdownOptions, readMarkdown } from './markdown';

/** Front matter and HTML comments skipped, as the typed-reference rules read Markdown. */
const skipBoth: MarkdownOptions = { frontMatter: 'skip', comments: 'skip' };

/** The code spans of `text`, each as `<line> <code>` and its link's index, if any. */
function spans(text: string): string[] {
  return readMarkdown(text, skipBoth).spans.map(
    ({ code, line, link }) =>
      `${String(line)} ${code}${link === undefined ? '' : ` @${String(link)}`}`,
  );
}

describe('readMarkdown', () => {
  test('reads code spans in and out of link text, and links inline and by reference', () => {
    const text = [
      'Use `a` and [`b`](x.ts#b), [the `c` one](y.md) and ``d`` or `` e ``.',
      'By reference [`f`][Ref  Label], collapsed [ref label][], shortcut [REF LABEL], none [nothing].',
      'Images ![`g`](x.png) and titles [h](z.ts#h "title") and <angles> [i](<a b.ts#i>).',
      'Parentheses [`p`](../src/a(1).ts#p) then `q`.',
      '',
      '[ref label]: refs.ts#f',
    ].join('\n');
    const read = readMarkdown(text, skipBoth);
    expect(spans(text)).toEqual([
      '1 a',
      '1 b @0',
      '1 c @1',
      '1 d',
      '1 e',
      '2 f @2',
      '3 g @5',
      '4 p @8',
      '4 q',
    ]);
    expect(read.links).toEqual([
      { destination: 'x.ts#b', line: 1, code: 'b' },
      { destination: 'y.md', line: 1, code: undefined },
      { destination: 'refs.ts#f', line: 2, code: 'f' },
      { destination: 'refs.ts#f', line: 2, code: undefined },
      { destination: 'refs.ts#f', line: 2, code: undefined },
      { destination: 'x.png', line: 3, code: 'g' },
      { destination: 'z.ts#h', line: 3, code: undefined },
      { destination: 'a b.ts#i', line: 3, code: undefined },
      { destination: '../src/a(1).ts#p', line: 4, code: 'p' },
    ]);
  });

  test('reads no code span or link a backslash escapes', () => {
    const read = readMarkdown('Not \\`code\\` nor \\[a](b.ts#c), but `kept`.', skipBoth);
    expect([read.spans.map(({ code }) => code), read.links]).toEqual([['kept'], []]);
  });

  test('reads link text wrapped over lines of a paragraph, at the line it opens', () => {
    expect(
      readMarkdown('First.\nWrapped [the `w`\nfunction](a.ts#w) here.', skipBoth).links,
    ).toEqual([{ destination: 'a.ts#w', line: 2, code: undefined }]);
    expect(spans('First.\nWrapped [the `w`\nfunction](a.ts#w).')).toEqual(['2 w @0']);
  });

  test('reads no front matter, code block or HTML comment as prose, and a footnote as prose', () => {
    const text = [
      '---',
      'title: `front`',
      '---',
      '',
      '<!-- `commented`',
      'over lines -->',
      '```ts',
      '`fenced`',
      '~~~',
      '```',
      '   ```',
      '`indentedFence`',
      '   ```',
      '````',
      '```',
      '`longerFence`',
      '````',
      '',
      '    indented `code` block',
      '',
      '- a list item',
      '',
      '    continued `listed` paragraph',
      '',
      '  ```',
      '  `listFence`',
      '  ```',
      '1. step',
      '     ```',
      '     `numberedFence`',
      '     ```',
      'Prose `kept` <!-- `inline` --> and `after`.',
      '',
      '[^1]: a `footnote` definition',
    ].join('\n');
    const read = readMarkdown(text, skipBoth);
    expect(read.spans.map(({ code }) => code)).toEqual(['listed', 'kept', 'after', 'footnote']);
    expect(read.codeLines.map(({ text: code }) => code)).toEqual([
      '`fenced`',
      '~~~',
      '`indentedFence`',
      '```',
      '`longerFence`',
      '    indented `code` block',
      '  `listFence`',
      '     `numberedFence`',
    ]);
  });

  test('takes a four-space line after a blank for code, and one continuing a paragraph for prose', () => {
    expect(spans('Para\n    `continued`\n\n    `code`')).toEqual(['2 continued']);
  });

  test('keeps an HTML comment inside code as code', () => {
    const read = readMarkdown('`<!-- kept -->` and\n\n```\n<!-- fenced -->\n```', skipBoth);
    expect([
      read.spans.map(({ code }) => code),
      read.codeLines.map(({ text: code }) => code),
    ]).toEqual([['<!-- kept -->'], ['<!-- fenced -->']]);
  });

  test('blanks code spans and comments in the prose lines, keeping their line numbers', () => {
    expect(readMarkdown('a `b` c <!-- d -->\ne', skipBoth).prose).toEqual([
      { text: `a     c ${' '.repeat(10)}`, line: 1 },
      { text: 'e', line: 2 },
    ]);
  });
});

describe('readMarkdown, its block edges', () => {
  /** The code lines of `text`. */
  const code = (text: string) =>
    readMarkdown(text, skipBoth).codeLines.map(({ text: line }) => line);

  test('a paragraph back at the margin ends the list, so four spaces after it are code again', () => {
    expect(code('- item\n\npara\n\n    `x`')).toEqual(['    `x`']);
  });

  test('an HTML comment opening a block runs past a blank line to its close', () => {
    expect(spans('<!-- a\n\n`hidden`\n-->\n\n`shown`')).toEqual(['6 shown']);
  });

  test('a backtick fence whose info string holds a backtick opens no fence', () => {
    expect([code('```x`y\n`z`'), code('```x\n`z`\n```')]).toEqual([[], ['`z`']]);
  });

  test('a fence indented four spaces past its block is indented code, not a fence', () => {
    expect(code('para\n\n    ```\n    `x`\n    ```')).toEqual(['    ```', '    `x`', '    ```']);
  });

  test('reads a reference definition indented under a list item', () => {
    const text = '- see [the cart][cart]\n\n    [cart]: a.ts#Cart';
    expect(readMarkdown(text, skipBoth).links.map(({ destination }) => destination)).toEqual([
      'a.ts#Cart',
    ]);
  });

  test('reads front matter and HTML comments as prose when asked, as epochs 1 and 2 do', () => {
    const text =
      '---\ntitle: `front`\n---\n\n<!-- `block`\nmore -->\n\nText <!-- `inline` [a](b.md) -->.';
    const asProse = readMarkdown(text, { frontMatter: 'prose', comments: 'prose' });
    expect([
      readMarkdown(text, skipBoth).spans.map(({ code: span }) => span),
      asProse.spans.map(({ code: span }) => span),
      asProse.links.map(({ destination }) => destination),
    ]).toEqual([[], ['front', 'block', 'inline'], ['b.md']]);
  });
});

describe('isMarkdown', () => {
  test.each([
    ['a.md', true],
    ['a.markdown', true],
    ['a.mdx', true],
    ['A.MD', true],
    ['a.md.tmpl', false],
    ['a.ts', false],
    ['md', false],
  ])('%s is Markdown: %p', (path, expected) => {
    expect(isMarkdown(path)).toBe(expected);
  });
});
