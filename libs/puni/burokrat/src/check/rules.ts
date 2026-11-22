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
import { resolveLinks } from './link-rules';

/** Every rule `puni burokrat check` applies. */
export const rules: readonly Rule[] = [
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
