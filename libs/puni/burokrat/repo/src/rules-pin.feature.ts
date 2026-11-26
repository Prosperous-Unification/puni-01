import { join } from 'node:path';
import {
  type CheckoutFiles,
  declareDocType,
  type DocTypeName,
  docTypesEpoch,
  explainDefect,
  type Repository,
  repinRegistry,
  replaceRulesSection,
  requirePinReached,
  RulesPinAhead,
} from '@puni/shared-checkout';
import type { RepoRequirements, RulesPinUpgrade } from './contract';
import { RulesSectionMissing, SourceRulesMissing, SourceRulesStale } from './failures';
import { readSourceCheckout } from './source-checkout';

/** The entry files raising a pin to {@link docTypesEpoch} declares a type in, by repository type. */
const entryTypes = {
  'system-state': { 'AGENTS.md': 'agents', 'README.md': 'readme' },
  'system-records': { 'AGENTS.md': 'agents' },
} as const satisfies Readonly<Record<string, Readonly<Record<string, DocTypeName>>>>;

/**
 * The entry files of `files`, a checkout of a `type` repository, that raising the pin `from` to
 * {@link docTypesEpoch} or later declares a type in, each with its text then: its text in `texts`
 * or else on disk, opened by the front matter of its type when it declares none. Only those it
 * changes are returned.
 */
function declareEntryTypes(
  files: CheckoutFiles,
  type: Repository['type'],
  texts: Readonly<Record<string, string>>,
): Record<string, string> {
  const declared: Record<string, string> = {};
  for (const [path, docType] of Object.entries(entryTypes[type])) {
    if (!files.exists(path)) continue;
    const text = texts[path] ?? files.readText(path);
    const next = declareDocType(text, docType);
    if (next !== files.readText(path)) declared[path] = next;
  }
  return declared;
}

/**
 * The {@link RulesPinUpgrade}. The repository is the system-state one of the nearest `puni.json`
 * at or above `cwd`; the latest epoch is `latestRules.epoch`, and the rules section in force
 * there is that of the checkout `puni` runs from, as `repo init` copies it. A pin at the latest
 * is `current`, and one past it `refused`. Otherwise every repository of the project is judged
 * by `latestRules` as the upgrade would leave it: with findings it is `failing` and nothing is
 * written; with none, the `AGENTS.md` rules section is rewritten with the one in force, then
 * `puni.json` with the latest pin, every other key kept in its order, and it is `upgraded`.
 * Raising a pin below {@link docTypesEpoch} to it or later also opens each entry file of either
 * repository that declares no document type (`AGENTS.md`, and the system-state `README.md`)
 * with the front matter of its type, as `repo init` now seeds them, judged so and written with
 * the rest; any other Markdown file declaring none is a finding of the judgement. A
 * source checkout holding an older epoch's rules is `refused`. A repository or source checkout
 * that cannot be found or read, or an `AGENTS.md` of either with no rules section, is
 * `defective`. Anything else propagates.
 */
export function createRulesPinUpgrade({
  checkoutRegistry,
  checkoutFiles,
  programSource,
  latestRules,
}: RepoRequirements): RulesPinUpgrade {
  /** The records checkout of the project of `found`, or `undefined` when it is not beside it. */
  const openRecords = (found: Repository): CheckoutFiles | undefined => {
    try {
      const records = checkoutRegistry.resolve(found, 'system-records');
      return checkoutFiles.open(records.root, records.type);
    } catch (caught) {
      if (explainDefect(caught) === undefined) throw caught;
      return undefined;
    }
  };
  const upgrade = (cwd: string) => {
    const found = checkoutRegistry.locate(cwd);
    const { root, registry } = checkoutRegistry.resolve(found, 'system-state');
    const from = registry.rules;
    const to = latestRules.epoch;
    requirePinReached(registry, to, programSource.version);
    if (from === to) return { kind: 'current', epoch: to } as const;
    const files = checkoutFiles.open(root, 'system-state');
    const { rules } = readSourceCheckout({
      checkoutRegistry,
      checkoutFiles,
      programSource,
      latestRules,
    });
    const agents = replaceRulesSection(files.readText('AGENTS.md'), rules);
    if (agents === undefined) {
      throw new RulesSectionMissing({ details: { file: join(root, 'AGENTS.md') } });
    }
    const declaring = from < docTypesEpoch && to >= docTypesEpoch;
    const state = declaring
      ? { ...declareEntryTypes(files, 'system-state', { 'AGENTS.md': agents }) }
      : {};
    const records = declaring ? openRecords(found) : undefined;
    const recordsTexts =
      records === undefined ? {} : declareEntryTypes(records, 'system-records', {});
    const texts = {
      'system-state': { 'AGENTS.md': agents, ...state },
      'system-records': recordsTexts,
    };
    const findings = latestRules.judge(cwd, texts);
    if (Object.values(findings).some((list) => list.length > 0)) {
      return { kind: 'failing', from, to, findings } as const;
    }
    const pinned = repinRegistry(files.readText('puni.json'), join(root, 'puni.json'), to);
    for (const [path, text] of Object.entries(texts['system-state'])) files.write(path, text);
    for (const [path, text] of Object.entries(recordsTexts)) records?.write(path, text);
    files.write('puni.json', pinned);
    return { kind: 'upgraded', from, to } as const;
  };
  return {
    upgrade(cwd) {
      try {
        return upgrade(cwd);
      } catch (caught) {
        if (caught instanceof RulesPinAhead || caught instanceof SourceRulesStale) {
          return { kind: 'refused', reason: caught.message };
        }
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
