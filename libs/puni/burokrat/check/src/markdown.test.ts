import { describe, expect, test } from 'bun:test';
import { readProse } from './markdown';

describe('readProse', () => {
  test('reads code spans in and out of link text, and links inline and by reference', () => {
    const text = [
      'Use `a` and [`b`](x.ts#b), [the `c` one](y.md) and ``d`` or `` e ``.',
      'By reference [`f`][ref], collapsed [ref][], shortcut [ref], none [nothing].',
      'Images ![`g`](x.png) and titles [h](z.ts#h "title") and <angles> [i](<a b.ts#i>).',
      'Parentheses [`p`](../src/a(1).ts#p) then `q`.',
      '',
      '[ref]: refs.ts#f',
    ].join('\n');
    const prose = readProse(text);
    expect(prose.spans).toEqual([
      { code: 'a', inLinkText: false },
      { code: 'b', inLinkText: true },
      { code: 'c', inLinkText: true },
      { code: 'd', inLinkText: false },
      { code: 'e', inLinkText: false },
      { code: 'f', inLinkText: true },
      { code: 'g', inLinkText: true },
      { code: 'p', inLinkText: true },
      { code: 'q', inLinkText: false },
    ]);
    expect(prose.links).toEqual([
      { destination: 'x.ts#b', code: 'b' },
      { destination: 'y.md', code: undefined },
      { destination: 'refs.ts#f', code: 'f' },
      { destination: 'refs.ts#f', code: undefined },
      { destination: 'refs.ts#f', code: undefined },
      { destination: 'x.png', code: 'g' },
      { destination: 'z.ts#h', code: undefined },
      { destination: 'a b.ts#i', code: undefined },
      { destination: '../src/a(1).ts#p', code: 'p' },
    ]);
  });

  test('reads link text wrapped over lines of a paragraph', () => {
    expect(readProse('Wrapped [the `w`\nfunction](a.ts#w) here.').links).toEqual([
      { destination: 'a.ts#w', code: undefined },
    ]);
    expect(readProse('Wrapped [`w`\n](a.ts#w).').links).toEqual([
      { destination: 'a.ts#w', code: 'w' },
    ]);
  });

  test('reads no front matter, fenced or indented code, or HTML comment', () => {
    const text = [
      '---',
      'title: `front`',
      '---',
      '',
      '<!-- `commented`',
      'over lines -->',
      '```ts',
      '`fenced`',
      '```',
      '',
      '    indented `code` block',
      '',
      '- a list item',
      '',
      '    continued `listed` paragraph',
      '1. step',
      '    `step` continuation',
      'Prose `kept`.',
    ].join('\n');
    expect(readProse(text).spans.map(({ code }) => code)).toEqual(['listed', 'step', 'kept']);
  });
});
