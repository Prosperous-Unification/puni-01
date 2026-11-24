import {
  agentsSections,
  countWords,
  indexFile,
  readHeadings,
  readRulesSection,
  type RepositoryType,
} from '@puni/shared-checkout';
import { agentsWordBudget, readmeWordBudget } from '../budgets';
import { agentsRulesDigest, digestRulesSection } from '../agents-rules';
import type { Breach, Rule, RuleReading } from '../finding';

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
 * `AGENTS.md` holds a `## Rules` section whose {@link digestRulesSection} is `digest`: any edit to
 * the rules but rewrapping is a finding. A missing file is `agents.exists`'s.
 */
export function pinAgentsRules(digest: string): Rule {
  return {
    id: 'agents.rules',
    remedy:
      'restore the rules section (git show origin/main:AGENTS.md); if the owner changed the rules, set agentsRulesDigest in the Burokrat check library to the digest printed here',
    judge(reading) {
      const text = readOptional(reading, 'AGENTS.md');
      if (text === undefined) return [];
      const section = readRulesSection(text);
      if (section === undefined) return [{ path: 'AGENTS.md', message: 'has no ## Rules heading' }];
      const actual = digestRulesSection(section);
      return actual === digest
        ? []
        : [
            {
              path: 'AGENTS.md',
              message: `rules section digests to ${actual}, not the pinned ${digest}`,
            },
          ];
    },
  };
}

/** {@link pinAgentsRules} to {@link agentsRulesDigest}, the owner's rules. */
export const agentsKeepRules = pinAgentsRules(agentsRulesDigest);

/**
 * `AGENTS.md` of a `type` repository holds only the headings puni seeds it with: one `# ` title,
 * and `## ` sections only of `agentsSections` of `@puni/shared-checkout`, each once. Any other
 * heading of level 1 or 2, setext included, is a breach naming it; a missing file is
 * `agents.exists`'s. Text inside an allowed section is not judged.
 */
export function limitAgentsHeadings(type: RepositoryType): Rule {
  const allowed = agentsSections[type];
  const listed = allowed.map((title) => `## ${title}`).join(', ');
  return {
    id: 'agents.headings',
    remedy: `remove the heading and its section, or move its text into an existing section; AGENTS.md holds one # title and only ${listed}, as puni burokrat repo init seeds it`,
    judge(reading) {
      const text = readOptional(reading, 'AGENTS.md');
      if (text === undefined) return [];
      const seen = new Set<string>();
      let titled = false;
      return readHeadings(text).flatMap(({ level, text: title, line }): Breach[] => {
        const at = `line ${String(line)}`;
        const shown = `${'#'.repeat(level)} ${title}`;
        if (level === 1) {
          if (!titled) {
            titled = true;
            return [];
          }
          return [{ path: 'AGENTS.md', message: `${at} is a second title, "${shown}"` }];
        }
        if (!allowed.includes(title)) {
          return [
            {
              path: 'AGENTS.md',
              message: `${at} is the heading "${shown}", which puni does not declare for AGENTS.md`,
            },
          ];
        }
        if (seen.has(title)) {
          return [{ path: 'AGENTS.md', message: `${at} repeats the heading "${shown}"` }];
        }
        seen.add(title);
        return [];
      });
    },
  };
}

/** {@link limitAgentsHeadings} of a system-state repository. */
export const stateAgentsHeadings = limitAgentsHeadings('system-state');

/** {@link limitAgentsHeadings} of a system-records repository. */
export const recordsAgentsHeadings = limitAgentsHeadings('system-records');

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
