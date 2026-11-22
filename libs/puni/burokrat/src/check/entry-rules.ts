import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { agentsWordBudget, countWords, readmeWordBudget } from '../budgets';
import { indexFile } from '../wiki/wiki-index';
import type { Finding, RepositoryReading, Rule } from './finding';

function readOptional(root: string, path: string): string | undefined {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;
}

function requireFile(rule: string, path: string): Rule {
  return ({ root }) =>
    existsSync(join(root, path)) ? [] : [{ rule, path, message: 'is missing' }];
}

function limitWords(rule: string, path: string, budget: number): Rule {
  return ({ root }) => {
    const text = readOptional(root, path);
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
export function agentsNamesIndex({ root }: RepositoryReading): Finding[] {
  const text = readOptional(root, 'AGENTS.md');
  if (text === undefined || text.includes(indexFile)) return [];
  return [{ rule: 'agents.index', path: 'AGENTS.md', message: `does not name ${indexFile}` }];
}

/** `CLAUDE.md` is a symlink whose target is exactly `AGENTS.md`. */
export function claudeLinksAgents({ root }: RepositoryReading): Finding[] {
  const path = 'CLAUDE.md';
  const finding = (message: string): Finding[] => [{ rule: 'claude.symlink', path, message }];
  let isLink: boolean;
  try {
    isLink = lstatSync(join(root, path)).isSymbolicLink();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return finding('is missing');
    }
    throw cause;
  }
  if (!isLink) return finding('is not a symlink to AGENTS.md');
  const target = readlinkSync(join(root, path));
  return target === 'AGENTS.md' ? [] : finding(`points to ${target}, not AGENTS.md`);
}

/** `README.md` exists at the root. */
export const readmeExists = requireFile('readme.exists', 'README.md');

/** `README.md` stays within {@link readmeWordBudget}; a missing file is `readme.exists`'s. */
export const readmeWords = limitWords('readme.words', 'README.md', readmeWordBudget);
