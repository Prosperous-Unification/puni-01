import { posix } from 'node:path';
import { explainDefect, type RepositoryRegistryResource } from '@puni/shared-checkout';
import type {
  AcceptedOutcomesResource,
  HarnessLogsResource,
  OutcomeAssessment,
  RateCardResource,
} from './contract';
import { buildBreakdown } from './breakdown';
import {
  HarnessLogMalformed,
  HarnessLogUnreadable,
  OutcomesUnreadable,
  PeriodRefused,
  RateCardMalformed,
  RateCardUnreadable,
} from './failures';
import { readPeriod } from './period';

/**
 * The {@link OutcomeAssessment}. The repository is the system-state one the nearest `puni.json`
 * at or above `cwd` names, its `<owner>/<name>` read from its remote URL; a relative rate card or
 * log directory is read from `cwd`, and no log directory of a harness means its default. The rate
 * card is read first, then the outcomes, then the logs, the costliest. A period that is none is
 * `refused`; a rate card, log or git that cannot be read or is malformed, and a registry or
 * checkout that cannot be found, are `failed`, a defect's reason ending in `; fix: <remedy>`.
 * Anything else propagates.
 */
export function createOutcomeAssessment({
  checkoutRegistry,
  rateCards,
  acceptedOutcomes,
  harnessLogs,
}: {
  checkoutRegistry: RepositoryRegistryResource;
  rateCards: RateCardResource;
  acceptedOutcomes: AcceptedOutcomesResource;
  harnessLogs: HarnessLogsResource;
}): OutcomeAssessment {
  return {
    assess(cwd, request) {
      const resolve = (path: string) => posix.resolve(cwd, path);
      const given = (paths: readonly string[], fallback: readonly string[]) =>
        paths.length === 0 ? fallback : paths.map(resolve);
      try {
        const period = readPeriod(request.since, request.until);
        const state = checkoutRegistry.resolve(checkoutRegistry.locate(cwd), 'system-state');
        const remote = state.registry.repos['system-state'].remote.url;
        const repository = new URL(remote).pathname.slice(1);
        const rateCard = rateCards.load(
          request.rateCard === undefined ? undefined : resolve(request.rateCard),
        );
        const outcomes = acceptedOutcomes.list(state.root, period);
        const defaults = harnessLogs.defaultSources;
        const usage = harnessLogs.read(
          {
            claudeProjects: given(request.claudeProjects, defaults.claudeProjects),
            codexSessions: given(request.codexSessions, defaults.codexSessions),
          },
          period,
          repository,
        );
        return {
          kind: 'assessed',
          breakdown: buildBreakdown({ usage, outcomes, rateCard, period, repository }),
        };
      } catch (caught) {
        if (caught instanceof PeriodRefused) return { kind: 'refused', reason: caught.message };
        if (
          caught instanceof RateCardUnreadable ||
          caught instanceof RateCardMalformed ||
          caught instanceof OutcomesUnreadable ||
          caught instanceof HarnessLogUnreadable ||
          caught instanceof HarnessLogMalformed
        ) {
          return { kind: 'failed', reason: caught.message };
        }
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'failed', reason };
      }
    },
  };
}
