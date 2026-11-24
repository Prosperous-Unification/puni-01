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
  agentsNamesMap,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
  recordsAgentsHeadings,
  stateAgentsHeadings,
} from './rules/entry.rule';
import { judgeEntryKinds } from './rules/entries.rule';
import { confineRecordsName, forbidDates } from './rules/history.rule';
import {
  forbidGeneratedIndex,
  limitIndexWords,
  requirePurposes,
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
  judgeReviewRecords,
  judgeSupersession,
} from './rules/records.rule';
import { judgeDocCommands, judgeDocPaths } from './rules/docs.rule';
import { requireProjectTargets } from './rules/project.rule';
import {
  forbidPlaintextSecrets,
  forbidRecordsAddresses,
  forbidStateAddresses,
} from './rules/secrets.rule';
import { matchRecordsLocation, requireCiGate } from './rules/workspace.rule';

const at =
  (level: RuleLevel) =>
  (rule: Rule): LeveledRule => ({ level, rule });

/**
 * The rules for a `system-state` repository. Entry files, the map (its sources, which the root
 * project's check reads across every project, its purposes, its budget and a leftover generated
 * index) and the CI workflow are repository-level; the per-file and per-project rules are project-level.
 */
export const codeRules: readonly LeveledRule[] = [
  ...[
    agentsExists,
    agentsWords,
    agentsNamesIndex,
    agentsNamesMap,
    ...agentsKeepRules,
    stateAgentsHeadings,
    claudeLinksAgents,
    readmeExists,
    readmeWords,
    limitIndexWords,
    matchRecordsLocation,
    requireCiGate,
    requirePurposes,
    forbidGeneratedIndex,
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
    judgeEntryKinds,
  ].map(at('project')),
];

/** The rules for the `system-records` repository, which is judged whole. */
export const recordsRules: readonly LeveledRule[] = [
  agentsExists,
  claudeLinksAgents,
  agentsWords,
  recordsAgentsHeadings,
  judgeEntryKinds,
  resolveAgentsLinks,
  judgeRecordsLayout,
  judgeRecordNames,
  judgeRecordFrontMatter,
  judgeReviewRecords,
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
 * repository, judging only the references that leave the linking file's project (a symlink's
 * target among them), and the symbols documentation names, which a project check leaves to this
 * run.
 */
export const crossProjectRules: readonly Rule[] = [
  resolveLinks,
  judgeDocPaths,
  judgeDocSymbols,
  judgeEntryKinds,
];

/**
 * The rules judging what a commit makes public, by the type of the repository judged: its
 * credentials and its addresses. `check --staged` applies them to the staged files as the git
 * index holds them, and `check --commits` to what each commit of a range adds and to its message;
 * either reads a symlink as its target text, as git holds it. Neither judges entry kinds: a
 * staged gitlink has no text and is not listed, and what a symlink points at is a state of the
 * tree, which `entries.kind` judges in every other run.
 */
export const secretRules: Readonly<Record<RepositoryType, readonly Rule[]>> = {
  'system-state': [forbidPlaintextSecrets, forbidStateAddresses],
  'system-records': [forbidPlaintextSecrets, forbidRecordsAddresses],
};

/** Every rule `puni burokrat check` judges by, as the module supplies it. */
export const checkRules: CheckRules = {
  sets: ruleSets,
  crossProject: crossProjectRules,
  secrets: secretRules,
  agentsRulesDigests,
};

/**
 * The rule objects ended by an `until` with no successor, by id, at that epoch: the only ids a
 * repository's verdict may lose when it raises its pin. A deleted rule is a loosening and is not
 * listed.
 */
export const retiredRules: Readonly<Record<string, number>> = {};

/** The latest rules epoch of {@link checkRules}. */
export const latestRulesEpoch = latestEpoch(listEveryRule(checkRules));
