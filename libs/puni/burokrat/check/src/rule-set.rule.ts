import type { RepositoryType } from '@puni/shared-checkout';
import type { LeveledRule, Rule, RuleLevel } from './finding';
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
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { requireProjectTargets } from './rules/project.rule';
import { forbidPlaintextSecrets } from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate } from './rules/workspace.rule';

const at =
  (level: RuleLevel) =>
  (rule: Rule): LeveledRule => ({ level, rule });

/**
 * The rules for a `system-state` repository. The generated index is judged only whole; entry
 * files and the index budget are repository-level; the per-project index rules and the per-file
 * rules are project-level.
 */
export const codeRules: readonly LeveledRule[] = [
  ...[
    agentsExists,
    agentsWords,
    agentsNamesIndex,
    claudeLinksAgents,
    readmeExists,
    readmeWords,
    limitIndexWords,
    matchRecordsLocation,
    requireCiGate,
  ].map(at('repository')),
  ...[
    forbidDates,
    confineRecordsName,
    resolveLinks,
    requireReadWhen,
    requireReadFirst,
    forbidPlaintextSecrets,
    requireProjectTargets,
    judgeDocPaths,
    judgeDocCommands,
  ].map(at('project')),
  at('whole')(matchGeneratedIndex),
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
  forbidPlaintextSecrets,
].map(at('repository'));

/** The rule set `puni burokrat check` applies to each repository type. */
export const ruleSets: Readonly<Record<RepositoryType, readonly LeveledRule[]>> = {
  'system-state': codeRules,
  'system-records': recordsRules,
};

/**
 * The rules `check --cross-project-links` applies over every file of a `system-state`
 * repository, judging only the references that leave the linking file's project.
 */
export const crossProjectRules: readonly Rule[] = [resolveLinks, judgeDocPaths];

/** The rules `check --staged` applies to the staged files, as the git index holds them. */
export const stagedRules: readonly Rule[] = [forbidPlaintextSecrets];
