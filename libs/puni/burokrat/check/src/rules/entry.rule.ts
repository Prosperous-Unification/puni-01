import { countWords, indexFile } from '@puni/shared-checkout';
import { agentsWordBudget, readmeWordBudget } from '../budgets';
import type { Finding, Rule, RuleReading } from '../finding';

function readOptional({ files }: RuleReading, path: string): string | undefined {
  return files.exists(path) ? files.readText(path) : undefined;
}

function requireFile(rule: string, path: string): Rule {
  return ({ files }) => (files.exists(path) ? [] : [{ rule, path, message: 'is missing' }]);
}

function limitWords(rule: string, path: string, budget: number): Rule {
  return (reading) => {
    const text = readOptional(reading, path);
    if (text === undefined) return [];
    const words = countWords(text);
    return words <= budget
      ? []
      : [{ rule, path, message: `has ${String(words)} words; at most ${String(budget)}` }];
  };
}

/** `AGENTS.md` exists at the root. */
export const agentsExists = requireFile('agents.exists', 'AGENTS.md');

/** `AGENTS.md` stays within {@link agentsWordBudget}; a missing file is `agents.exists`'s. */
export const agentsWords = limitWords('agents.words', 'AGENTS.md', agentsWordBudget);

/** `AGENTS.md` names the generated entry point, `wiki/index/index.md`. */
export function agentsNamesIndex(reading: RuleReading): Finding[] {
  const text = readOptional(reading, 'AGENTS.md');
  if (text === undefined || text.includes(indexFile)) return [];
  return [{ rule: 'agents.index', path: 'AGENTS.md', message: `does not name ${indexFile}` }];
}

/** `CLAUDE.md` is a symlink whose target is exactly `AGENTS.md`. */
export function claudeLinksAgents({ files }: RuleReading): Finding[] {
  const path = 'CLAUDE.md';
  const finding = (message: string): Finding[] => [{ rule: 'claude.symlink', path, message }];
  const kind = files.describe(path);
  if (kind === 'absent') return finding('is missing');
  if (kind !== 'symlink') return finding('is not a symlink to AGENTS.md');
  const target = files.readLinkTarget(path);
  return target === 'AGENTS.md' ? [] : finding(`points to ${target}, not AGENTS.md`);
}

/** `README.md` exists at the root. */
export const readmeExists = requireFile('readme.exists', 'README.md');

/** `README.md` stays within {@link readmeWordBudget}; a missing file is `readme.exists`'s. */
export const readmeWords = limitWords('readme.words', 'README.md', readmeWordBudget);
