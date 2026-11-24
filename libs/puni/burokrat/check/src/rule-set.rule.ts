import type { RepositoryType } from '@puni/shared-checkout';
import { agentsRulesDigests } from './agents-rules';
import {
  type CheckRules,
  latestEpoch,
  type LeveledRule,
  listEveryRule,
  type Rule,
  type RuleLevel,
} from './finding';
import { forbidFileHeaders } from './rules/code.rule';
import {
  agentsExists,
  agentsKeepRules,
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
  requireScope,
  requireSection,
} from './rules/index.rule';
import { judgeDocSymbols, limitPageWords } from './rules/wiki.rule';
import { resolveAgentsLinks, resolveLinks } from './rules/links.rule';
import {
  judgeRecordFrontMatter,
  judgeRecordNames,
  judgeRecordsLayout,
  judgeSupersession,
} from './rules/records.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { requireProjectTargets } from './rules/project.rule';
import {
  forbidPlaintextSecrets,
  forbidRecordsAddresses,
  forbidStateAddresses,
} from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate, requireIndexSync } from './rules/workspace.rule';

const at =
  (level: RuleLevel) =>
  (rule: Rule): LeveledRule => ({ level, rule });

/**
 * The rules for a `system-state` repository. The generated index is judged only whole; entry
 * files, the index budget, `nx.json` and the index sources (every `project.json`, which the root
 * project's check reads) are repository-level; the per-file and per-project rules are
 * project-level.
 */
export const codeRules: readonly LeveledRule[] = [
  ...[
    agentsExists,
    agentsWords,
    agentsNamesIndex,
    ...agentsKeepRules,
    claudeLinksAgents,
    readmeExists,
    readmeWords,
    limitIndexWords,
    matchRecordsLocation,
    requireCiGate,
    requireIndexSync,
    requireReadWhen,
    requireReadFirst,
    requireScope,
    requireSection,
  ].map(at('repository')),
  ...[
    forbidDates,
    confineRecordsName,
    resolveLinks,
    forbidPlaintextSecrets,
    forbidStateAddresses,
    forbidFileHeaders,
    requireProjectTargets,
    judgeDocPaths,
    judgeDocCommands,
    limitPageWords,
    judgeDocSymbols,
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
  forbidRecordsAddresses,
].map(at('repository'));

/** The rule set `puni burokrat check` applies to each repository type. */
export const ruleSets: Readonly<Record<RepositoryType, readonly LeveledRule[]>> = {
  'system-state': codeRules,
  'system-records': recordsRules,
};

/**
 * The rules `check --cross-project-links` applies over every file of a `system-state`
 * repository, judging only the references that leave the linking file's project, and the
 * symbols documentation names, which a project check leaves to this run.
 */
export const crossProjectRules: readonly Rule[] = [resolveLinks, judgeDocPaths, judgeDocSymbols];

/** The rules `check --staged` applies to the staged files, as the git index holds them. */
export const stagedRules: readonly Rule[] = [forbidPlaintextSecrets];

/** Every rule `puni burokrat check` judges by, as the module supplies it. */
export const checkRules: CheckRules = {
  sets: ruleSets,
  crossProject: crossProjectRules,
  staged: stagedRules,
  agentsRulesDigests,
};

/**
 * The rules retired with no successor, by id, at the epoch from which they no longer apply: the
 * only ids a repository's verdict may lose when it raises its pin.
 */
export const retiredRules: Readonly<Record<string, number>> = {};

/** The latest rules epoch of {@link checkRules}. */
export const latestRulesEpoch = latestEpoch(listEveryRule(checkRules));
