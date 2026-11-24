import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentsRulesDigests,
  digestRulesSection,
  readRulesSection,
  rulesDigestAt,
} from '@puni/burokrat-check';

const root = new URL('../', import.meta.url).pathname;

describe('agentsRulesDigests', () => {
  test("in force at this repository's pin is the digest of its AGENTS.md rules section", () => {
    const section = readRulesSection(readFileSync(join(root, 'AGENTS.md'), 'utf8'));
    const { rules } = JSON.parse(readFileSync(join(root, 'puni.json'), 'utf8')) as {
      rules: number;
    };
    expect(section === undefined ? undefined : digestRulesSection(section)).toBe(
      rulesDigestAt(agentsRulesDigests, rules),
    );
  });
});
