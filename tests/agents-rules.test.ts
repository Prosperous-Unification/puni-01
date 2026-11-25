import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentsRulesDigests,
  burokratCheckModule,
  digestRulesSection,
  readRulesSection,
  rulesDigestAt,
} from '@puni/burokrat-check';
import { checkoutModule } from '@puni/shared-checkout';
import { recordsModule } from '@puni/shared-records';
import { nodeHostModule } from '@puni/shared-testing';
import { DiBag } from 'di-bag';

const root = new URL('../', import.meta.url).pathname;
const { rules: pin } = JSON.parse(readFileSync(join(root, 'puni.json'), 'utf8')) as {
  rules: number;
};

const container = DiBag.createBuilder()
  .withInstalledModules([nodeHostModule, checkoutModule, recordsModule, burokratCheckModule])
  .withServices({
    commandCatalog: () => ({ list: () => [] }),
    programSource: () => ({ directory: root, version: 'test' }),
    projectSources: () => [],
  })
  .buildContainer();

afterAll(async () => {
  await container.close();
});

describe("this repository's rules pin", () => {
  test('is the latest epoch of the rules it ships', () => {
    expect(pin).toBe(container.resolve('latestRules').epoch);
  });

  test('reaches every epoch at which the rules text changed', () => {
    expect(
      Object.keys(agentsRulesDigests)
        .map(Number)
        .filter((epoch) => epoch > pin),
    ).toEqual([]);
  });

  test("has in force the digest of this repository's AGENTS.md rules section", () => {
    const section = readRulesSection(readFileSync(join(root, 'AGENTS.md'), 'utf8'));
    expect(section === undefined ? undefined : digestRulesSection(section)).toBe(
      rulesDigestAt(agentsRulesDigests, pin),
    );
  });
});
