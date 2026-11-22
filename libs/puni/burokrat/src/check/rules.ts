import {
  agentsExists,
  agentsNamesIndex,
  agentsWords,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
} from './entry-rules';
import type { Rule } from './finding';
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

/** The rules for a `code` repository. */
export const codeRules: readonly Rule[] = [
  agentsExists,
  agentsWords,
  agentsNamesIndex,
  claudeLinksAgents,
  readmeExists,
  readmeWords,
  forbidDates,
  confineRecordsName,
  resolveLinks,
  matchGeneratedIndex,
  limitIndexWords,
  requireReadWhen,
  requireReadFirst,
];

/** The rules for a `records` repository. */
export const recordsRules: readonly Rule[] = [
  agentsExists,
  claudeLinksAgents,
  agentsWords,
  resolveAgentsLinks,
  judgeRecordsLayout,
  judgeRecordNames,
  judgeRecordFrontMatter,
  judgeSupersession,
];

/** The rule set `puni burokrat check` applies to each repository kind. */
export const ruleSets: Readonly<Record<RepositoryKind, readonly Rule[]>> = {
  code: codeRules,
  records: recordsRules,
};
