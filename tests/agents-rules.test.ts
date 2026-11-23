import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentsRulesDigest, digestRulesSection, readRulesSection } from '@puni/burokrat-check';

const root = new URL('../', import.meta.url).pathname;

describe('agentsRulesDigest', () => {
  test("is the digest of this repository's AGENTS.md rules section", () => {
    const section = readRulesSection(readFileSync(join(root, 'AGENTS.md'), 'utf8'));
    expect(section === undefined ? undefined : digestRulesSection(section)).toBe(agentsRulesDigest);
  });
});
