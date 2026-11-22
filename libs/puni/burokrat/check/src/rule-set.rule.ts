import type { RepositoryType } from '@puni/shared-checkout';
import type { LeveledRule } from './finding';
import {
  agentsExists,
  agentsNamesIndex,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './rules/entry.rule';
import { confineRecordsName, forbidDates } from './rules/history.rule';
import {
  limitIndexWords,
  matchGeneratedIndex,
  requireReadFirst,
  requireReadWhen,
} from './rules/index.rule';
import { resolveAgentsLinks, resolveLinks } from './rules/links.rule';
import {
  judgeRecordFrontMatter,
  judgeRecordNames,
  judgeRecordsLayout,
  judgeSupersession,
} from './rules/records.rule';

const repositoryLevel = (judge: LeveledRule['judge']): LeveledRule => ({
  level: 'repository',
  judge,
});

const projectLevel = (judge: LeveledRule['judge']): LeveledRule => ({ level: 'project', judge });

/**
 * The rules for a `system-state` repository. Entry-file and generated-index rules are
 * repository-level; the per-project index rules and the per-file rules are project-level.
 */
export const codeRules: readonly LeveledRule[] = [
  repositoryLevel(agentsExists),
  repositoryLevel(agentsWords),
  repositoryLevel(agentsNamesIndex),
  repositoryLevel(claudeLinksAgents),
  repositoryLevel(readmeExists),
  repositoryLevel(readmeWords),
  projectLevel(forbidDates),
  projectLevel(confineRecordsName),
  projectLevel(resolveLinks),
  repositoryLevel(matchGeneratedIndex),
  repositoryLevel(limitIndexWords),
  projectLevel(requireReadWhen),
  projectLevel(requireReadFirst),
];

/** The rules for the `system-records` repository, which is judged whole. */
export const recordsRules: readonly LeveledRule[] = [
  agentsExists,
  claudeLinksAgents,
  agentsWords,
  resolveAgentsLinks,
  judgeRecordsLayout,
  judgeRecordNames,
  judgeRecordFrontMatter,
  judgeSupersession,
].map(repositoryLevel);

/** The rule set `puni burokrat check` applies to each repository type. */
export const ruleSets: Readonly<Record<RepositoryType, readonly LeveledRule[]>> = {
  'system-state': codeRules,
  'system-records': recordsRules,
};
