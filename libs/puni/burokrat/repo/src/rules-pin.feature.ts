import { join } from 'node:path';
import {
  explainDefect,
  repinRegistry,
  replaceRulesSection,
  RulesPinAhead,
} from '@puni/shared-checkout';
import type { RepoRequirements, RulesPinUpgrade } from './contract';
import { RulesSectionMissing, SourceRulesMissing } from './failures';
import { readSourceCheckout } from './source-checkout';

/**
 * The {@link RulesPinUpgrade}. The repository is the system-state one of the nearest `puni.json`
 * at or above `cwd`; the latest epoch is `latestRules.epoch`, and the rules section in force
 * there is that of the checkout `puni` runs from, as `repo init` copies it. A pin at the latest
 * is `current`, and one past it `refused`. Otherwise the whole repository is judged by
 * `latestRules` as the upgrade would leave it: with findings it is `failing` and nothing is
 * written; with none, `puni.json` is rewritten with the latest pin, every other key kept in its
 * order, and the `AGENTS.md` rules section with the one in force, and it is `upgraded`. A
 * repository or source checkout that cannot be found or read, or an `AGENTS.md` of either with
 * no rules section, is `defective`. Anything else propagates.
 */
export function createRulesPinUpgrade({
  checkoutRegistry,
  checkoutFiles,
  programSource,
  latestRules,
}: RepoRequirements): RulesPinUpgrade {
  const upgrade = (cwd: string) => {
    const found = checkoutRegistry.locate(cwd);
    const { root, registry } = checkoutRegistry.resolve(found, 'system-state');
    const from = registry.rules;
    const to = latestRules.epoch;
    if (from > to) {
      throw new RulesPinAhead({
        details: { pin: from, latest: to, version: programSource.version },
      });
    }
    if (from === to) return { kind: 'current', epoch: to } as const;
    const { rules } = readSourceCheckout({ checkoutRegistry, checkoutFiles, programSource });
    const findings = latestRules.judge(cwd, rules);
    if (findings.length > 0) return { kind: 'failing', from, to, findings } as const;
    const files = checkoutFiles.open(root, 'system-state');
    const agents = replaceRulesSection(files.readText('AGENTS.md'), rules);
    if (agents === undefined) {
      throw new RulesSectionMissing({ details: { file: join(root, 'AGENTS.md') } });
    }
    const registryText = repinRegistry(files.readText('puni.json'), join(root, 'puni.json'), to);
    files.write('puni.json', registryText);
    files.write('AGENTS.md', agents);
    return { kind: 'upgraded', from, to } as const;
  };
  return {
    upgrade(cwd) {
      try {
        return upgrade(cwd);
      } catch (caught) {
        if (caught instanceof RulesPinAhead) return { kind: 'refused', reason: caught.message };
        if (caught instanceof SourceRulesMissing || caught instanceof RulesSectionMissing) {
          return { kind: 'defective', reason: caught.message };
        }
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'defective', reason };
      }
    },
  };
}
