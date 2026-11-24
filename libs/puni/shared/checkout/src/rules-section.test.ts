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

  test('a last section runs to the end; no heading is undefined', () => {
    expect(replaceRulesSection('# r\n\n## Rules\n\nold\n', '## Rules\n\nnew\n')).toBe(
      '# r\n\n## Rules\n\nnew\n',
    );
    expect(replaceRulesSection('# r\n\n## Rulesets\n', 'x')).toBeUndefined();
  });
});
