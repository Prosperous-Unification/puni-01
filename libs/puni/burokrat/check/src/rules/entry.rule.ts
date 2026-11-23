import { countWords, indexFile } from '@puni/shared-checkout';
import { agentsWordBudget, readmeWordBudget } from '../budgets';
import type { Rule, RuleReading } from '../finding';

function readOptional({ files }: RuleReading, path: string): string | undefined {
  return files.exists(path) ? files.readText(path) : undefined;
}

function requireFile(id: string, path: string, remedy: string): Rule {
  return {
    id,
    remedy,
    judge: ({ files }) => (files.exists(path) ? [] : [{ path, message: 'is missing' }]),
  };
}

function limitWords(id: string, path: string, budget: number): Rule {
  return {
    id,
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

/** `AGENTS.md` names the generated entry point, `wiki/index/index.md`. */
export const agentsNamesIndex: Rule = {
  id: 'agents.index',
  remedy: `name ${indexFile} in AGENTS.md as the map to read first`,
  judge(reading) {
    const text = readOptional(reading, 'AGENTS.md');
    if (text === undefined || text.includes(indexFile)) return [];
    return [{ path: 'AGENTS.md', message: `does not name ${indexFile}` }];
  },
};

/**
 * The titles of the six rules of `AGENTS.md`, in their order. Only the owner changes the rules;
 * when the owner has, this list changes to match, and nothing else does.
 */
export const agentsRuleTitles = [
  'State, not history.',
  'One home for every fact.',
  'The task sets the scope.',
  'Ask only before what cannot be undone:',
  'Fail loudly.',
  'Evidence, not opinion.',
] as const;

/**
 * `AGENTS.md` holds each of {@link agentsRuleTitles} as its numbered rule, `<n>. **<title>**`; a
 * missing file is `agents.exists`'s.
 */
export const agentsKeepRules: Rule = {
  id: 'agents.rules',
  remedy:
    'restore the rule in AGENTS.md; if the owner changed the rules, update agentsRuleTitles in the Burokrat check library to match',
  judge(reading) {
    const text = readOptional(reading, 'AGENTS.md');
    if (text === undefined) return [];
    return agentsRuleTitles.flatMap((title, index) => {
      const rule = `${String(index + 1)}. **${title}**`;
      return text.includes(rule) ? [] : [{ path: 'AGENTS.md', message: `does not hold ${rule}` }];
    });
  },
};

/** `CLAUDE.md` is a symlink whose target is exactly `AGENTS.md`. */
export const claudeLinksAgents: Rule = {
  id: 'claude.symlink',
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
