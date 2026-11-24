import {
  countWords,
  formatMapCommand,
  readRulesSection,
  rulesUpgradeCommand,
} from '@puni/shared-checkout';
import { agentsWordBudget, readmeWordBudget } from '../budgets';
import { agentsRulesDigests, digestRulesSection } from '../agents-rules';
import type { Rule, RuleReading } from '../finding';

function readOptional({ files }: RuleReading, path: string): string | undefined {
  return files.exists(path) ? files.readText(path) : undefined;
}

function requireFile(id: string, path: string, remedy: string): Rule {
  return {
    id,
    since: 1,
    remedy,
    judge: ({ files }) => (files.exists(path) ? [] : [{ path, message: 'is missing' }]),
  };
}

function limitWords(id: string, path: string, budget: number): Rule {
  return {
    id,
    since: 1,
    remedy: `shorten ${path} to at most ${String(budget)} words`,
    judge(reading) {
      const text = readOptional(reading, path);
      if (text === undefined) return [];
      const words = countWords(text);
      return words <= budget
        ? []
        : [{ path, message: `has ${String(words)} words; at most ${String(budget)}` }];
    },
  };
}

/** `AGENTS.md` exists at the root. */
export const agentsExists = requireFile(
  'agents.exists',
  'AGENTS.md',
  'create AGENTS.md at the root: the rules every session here follows',
);

/** `AGENTS.md` stays within {@link agentsWordBudget}; a missing file is `agents.exists`'s. */
export const agentsWords = limitWords('agents.words', 'AGENTS.md', agentsWordBudget);

/** The generated index file AGENTS.md named before the map was printed. */
const indexFile = 'wiki/index/index.md';

/**
 * `AGENTS.md` names the generated entry point, `index.md` of `wiki/index`: the judgement up to
 * epoch 2, which {@link agentsNamesMap} replaces.
 */
export const agentsNamesIndex: Rule = {
  id: 'agents.index',
  since: 1,
  until: 2,
  remedy: `name ${indexFile} in AGENTS.md as the map to read first, or run \`${rulesUpgradeCommand}\` to take the rules of epoch 2`,
  judge(reading) {
    const text = readOptional(reading, 'AGENTS.md');
    if (text === undefined || text.includes(indexFile)) return [];
    return [{ path: 'AGENTS.md', message: `does not name ${indexFile}` }];
  },
};

/** The command printing the map, as `AGENTS.md` names it, run through `bun run` or not. */
const mapCommand = formatMapCommand('puni');

/** `AGENTS.md` names the command that prints the map, `puni burokrat wiki map`. */
export const agentsNamesMap: Rule = {
  id: 'agents.index',
  since: 2,
  remedy: `name \`${mapCommand}\` in AGENTS.md as the command printing the map to read first`,
  judge(reading) {
    const text = readOptional(reading, 'AGENTS.md');
    if (text === undefined || text.includes(mapCommand)) return [];
    return [{ path: 'AGENTS.md', message: `does not name ${mapCommand}` }];
  },
};

/**
 * The `agents.rules` rules of `digests`, one per epoch it keys: `AGENTS.md` holds a `## Rules`
 * section whose {@link digestRulesSection} is that epoch's digest, from that epoch until the next
 * one keyed, so a changed rules text is a later rule like any other. Any edit to the rules but
 * rewrapping is a finding; a missing file is `agents.exists`'s.
 */
export function pinAgentsRules(digests: Readonly<Record<number, string>>): Rule[] {
  const epochs = Object.keys(digests)
    .map(Number)
    .sort((left, right) => left - right);
  return epochs.map((since, index): Rule => {
    const until = epochs[index + 1];
    const digest = digests[since] ?? '';
    const restore = 'restore the rules section (git show origin/main:AGENTS.md)';
    return {
      id: 'agents.rules',
      since,
      ...(until === undefined ? {} : { until }),
      remedy:
        until === undefined
          ? `${restore}; if the owner changed the rules, add the digest printed here to agentsRulesDigests in the Burokrat check library under the next epoch`
          : `${restore}, then run ${rulesUpgradeCommand} to take the rules of epoch ${String(until)}`,
      judge(reading) {
        const text = readOptional(reading, 'AGENTS.md');
        if (text === undefined) return [];
        const section = readRulesSection(text);
        if (section === undefined) {
          return [{ path: 'AGENTS.md', message: 'has no ## Rules heading' }];
        }
        const actual = digestRulesSection(section);
        return actual === digest
          ? []
          : [
              {
                path: 'AGENTS.md',
                message: `rules section digests to ${actual}, not ${digest}, the rules in force at epoch ${String(reading.registry.rules)}`,
              },
            ];
      },
    };
  });
}

/** {@link pinAgentsRules} of {@link agentsRulesDigests}, the owner's rules. */
export const agentsKeepRules: readonly Rule[] = pinAgentsRules(agentsRulesDigests);

/** `CLAUDE.md` is a symlink whose target is exactly `AGENTS.md`. */
export const claudeLinksAgents: Rule = {
  id: 'claude.symlink',
  since: 1,
  remedy: 'recreate the link: ln -sf AGENTS.md CLAUDE.md',
  judge({ files }) {
    const path = 'CLAUDE.md';
    const kind = files.describe(path);
    if (kind === 'absent') return [{ path, message: 'is missing' }];
    if (kind === 'directory') {
      return [
        {
          path,
          message: 'is a directory, not a symlink to AGENTS.md',
          remedy: 'remove the directory, then link: rm -r CLAUDE.md && ln -s AGENTS.md CLAUDE.md',
        },
      ];
    }
    if (kind !== 'symlink') return [{ path, message: 'is not a symlink to AGENTS.md' }];
    const target = files.readLinkTarget(path);
    return target === 'AGENTS.md' ? [] : [{ path, message: `points to ${target}, not AGENTS.md` }];
  },
};

/** `README.md` exists at the root. */
export const readmeExists = requireFile(
  'readme.exists',
  'README.md',
  'create README.md at the root: what the repository is, for a person arriving',
);

/** `README.md` stays within {@link readmeWordBudget}; a missing file is `readme.exists`'s. */
export const readmeWords = limitWords('readme.words', 'README.md', readmeWordBudget);
