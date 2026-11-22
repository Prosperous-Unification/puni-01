import {
  agentsExists,
  agentsNamesIndex,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './entry-rules';
import type { LeveledRule } from './finding';
import { confineRecordsName, forbidDates } from './history-rules';
import {
  limitIndexWords,
  matchGeneratedIndex,
  requireReadFirst,
  requireReadWhen,
} from './index-rules';
import { resolveAgentsLinks, resolveLinks } from './link-rules';
import {
  judgeRecordFrontMatter,
  judgeRecordNames,
  judgeRecordsLayout,
  judgeSupersession,
} from './records-rules';
import type { RepositoryKind } from '../repository';

const repositoryLevel = (judge: LeveledRule['judge']): LeveledRule => ({
  level: 'repository',
  judge,
});

const projectLevel = (judge: LeveledRule['judge']): LeveledRule => ({ level: 'project', judge });

/**
 * The rules for a `code` repository. Entry-file and generated-index rules are repository-level;
 * the per-project index rules and the per-file rules are project-level.
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

/** The rules for a `records` repository, which is judged whole. */
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

/** The rule set `puni burokrat check` applies to each repository kind. */
export const ruleSets: Readonly<Record<RepositoryKind, readonly LeveledRule[]>> = {
  code: codeRules,
  records: recordsRules,
};
