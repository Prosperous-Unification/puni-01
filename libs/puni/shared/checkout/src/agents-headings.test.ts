import { describe, expect, test } from 'bun:test';
import { agentsSections, readHeadings } from './agents-headings';

describe('readHeadings', () => {
  test('reads ATX headings of level 1 and 2, closing hashes and indent included', () => {
    expect(readHeadings('# Title\n\n  ## Two ##\n### Three\n####\n#NoSpace\n##\n')).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Two', line: 3 },
      { level: 2, text: '', line: 7 },
    ]);
  });

  test('reads a setext heading under a paragraph line, not a break after a blank or a list', () => {
    expect(readHeadings('Big\n===\n\nSmall\n---\n\n---\n- item\n---\n')).toEqual([
      { level: 1, text: 'Big', line: 1 },
      { level: 2, text: 'Small', line: 4 },
    ]);
  });

  test('skips a closed fenced code block; a fence left open hides nothing', () => {
    expect(readHeadings('```sh\n# a comment\n```\n## After\n~~~\n## Hidden?\n')).toEqual([
      { level: 2, text: 'After', line: 4 },
      { level: 2, text: 'Hidden?', line: 6 },
    ]);
  });
});

describe('readHeadings and front matter', () => {
  test('the front matter opening the text holds no heading: its closing --- underlines none', () => {
    expect(readHeadings('---\npuni-doc-type: agents\n---\n\n# Title\n\nText\n---\n')).toEqual([
      { level: 1, text: 'Title', line: 5 },
      { level: 2, text: 'Text', line: 7 },
    ]);
  });

  test('a --- that opens no front matter is read as before', () => {
    expect(readHeadings('# T\n---\nkey: v\n---\n')).toEqual([
      { level: 1, text: 'T', line: 1 },
      { level: 2, text: 'key: v', line: 3 },
    ]);
  });
});

describe('agentsSections', () => {
  test("are each type's template sections, and the rules section repo init appends to state", () => {
    expect(agentsSections).toEqual({
      'system-state': ['Working here', 'Rules'],
      'system-records': ['Working here', 'Layout', 'Rules'],
    });
  });
});
