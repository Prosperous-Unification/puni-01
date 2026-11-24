import { describe, expect, test } from 'bun:test';
import {
  declareDocType,
  docTypeNames,
  isMarkdown,
  listPlacedTypes,
  readDocType,
} from './doc-types';

describe('readDocType', () => {
  test.each([
    ['---\npuni-doc-type: wiki-page\ntitle: A\n---\n', { kind: 'declared', type: 'wiki-page' }],
    ['---\ntags:\n  - a\npuni-doc-type:  product \n---\n', { kind: 'declared', type: 'product' }],
    ['---\npuni-doc-type: howto\n---\n', { kind: 'unknown', value: 'howto' }],
    ['---\npuni-doc-type:\n---\n', { kind: 'unknown', value: '' }],
    ['---\ntitle: A\n---\n', { kind: 'undeclared' }],
    ['# A\n\npuni-doc-type: agents\n', { kind: 'undeclared' }],
    ['---\npuni-doc-type: agents\n', { kind: 'undeclared' }],
  ] as const)('%j declares %j', (text, declaration) => {
    expect(readDocType(text)).toEqual(declaration);
  });
});

describe('declareDocType', () => {
  test('opens a text without front matter with the type alone', () => {
    expect(declareDocType('# A\n', 'readme')).toBe('---\npuni-doc-type: readme\n---\n\n# A\n');
  });

  test('puts the type first in the front matter a text has', () => {
    expect(declareDocType('---\ntitle: A\n---\n\n# A\n', 'wiki-page')).toBe(
      '---\npuni-doc-type: wiki-page\ntitle: A\n---\n\n# A\n',
    );
  });

  test('leaves a text declaring a type, even one that is no type, as it is', () => {
    for (const text of ['---\npuni-doc-type: agents\n---\n', '---\npuni-doc-type: x\n---\n']) {
      expect(declareDocType(text, 'readme')).toBe(text);
    }
  });
});

describe('where each type lives', () => {
  test.each([
    ['AGENTS.md', 'system-state', ['agents']],
    ['AGENTS.md', 'system-records', ['agents']],
    ['README.md', 'system-state', ['readme']],
    ['wiki/gate.md', 'system-state', ['wiki-page']],
    ['wiki/how-to/x.mdx', 'system-state', ['wiki-page']],
    ['wiki/ops/x.md', 'system-state', []],
    ['wiki/index/index.md', 'system-state', []],
    ['docs/guide.md', 'system-state', ['product']],
    ['libs/x/README.md', 'system-state', []],
    ['libs/x/CLAUDE.md', 'system-state', []],
    ['nav/plans/2031-04-05-a.md', 'system-state', ['product']],
    ['nav/plans/2031-04-05-a.md', 'system-records', ['record']],
    ['nav/plans/deep/a.md', 'system-records', ['product']],
  ] as const)('%s of a %s repository: %j', (path, repository, types) => {
    expect(listPlacedTypes(path, repository)).toEqual([...types]);
  });

  test('the types are the closed set, in order', () => {
    expect(docTypeNames).toEqual(['agents', 'readme', 'wiki-page', 'product', 'record']);
  });
});

describe('isMarkdown', () => {
  test.each([
    ['a.md', true],
    ['a.mdx', true],
    ['a.markdown', true],
    ['A.MD', true],
    ['a.md.tmpl', false],
    ['md', false],
  ] as const)('%s: %p', (path, markdown) => {
    expect(isMarkdown(path)).toBe(markdown);
  });
});
