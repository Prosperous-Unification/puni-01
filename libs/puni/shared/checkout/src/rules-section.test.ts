import { describe, expect, test } from 'bun:test';
import { readRulesSection, replaceRulesSection } from './rules-section';

const text = '# r\n\n## Working here\n\n- a\n\n## Rules\n\n1. Old.\n\n## After\n\nkept\n';

describe('replaceRulesSection', () => {
  test('replaces exactly the section readRulesSection reads, keeping what is around it', () => {
    expect(readRulesSection(text)).toBe('## Rules\n\n1. Old.\n\n');
    expect(replaceRulesSection(text, '## Rules\n\n1. New.\n\n')).toBe(
      '# r\n\n## Working here\n\n- a\n\n## Rules\n\n1. New.\n\n## After\n\nkept\n',
    );
  });

  test.each(['## Rules\n\n1. New.', '## Rules\n\n1. New.\n', '## Rules\n\n1. New.\n\n\n\n'])(
    'leaves one blank line before a following heading, whatever %j ends in',
    (section) => {
      expect(replaceRulesSection(text, section)).toBe(
        '# r\n\n## Working here\n\n- a\n\n## Rules\n\n1. New.\n\n## After\n\nkept\n',
      );
    },
  );

  test('a last section ends the file in exactly one newline; no heading is undefined', () => {
    for (const section of ['## Rules\n\nnew', '## Rules\n\nnew\n\n\n']) {
      expect(replaceRulesSection('# r\n\n## Rules\n\nold\n', section)).toBe(
        '# r\n\n## Rules\n\nnew\n',
      );
    }
    expect(replaceRulesSection('# r\n\n## Rulesets\n', 'x')).toBeUndefined();
  });
});
