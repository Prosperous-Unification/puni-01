import type { Finding } from '@puni/shared-failures';
import { RulesPinAhead } from './failures';
import type { RepositoryRegistry, RepositoryType } from './registry';

/** The command that raises a repository's `rules` pin; the app's command tree is judged to hold it. */
export const rulesUpgradeCommand = 'puni burokrat repo upgrade';

/**
 * Judging a project's repositories at the latest rules epoch this `puni` knows, as raising its
 * `rules` pin would leave them. The Burokrat check library supplies it, so a group that raises
 * the pin needs none of that library.
 */
export interface LatestRules {
  /** The latest rules epoch: the largest epoch at which any rule starts or stops applying. */
  readonly epoch: number;
  /**
   * The findings of the rules of {@link LatestRules.epoch} over each whole repository of the
   * project whose system-state repository holds the nearest `puni.json` at or above `cwd`, judged
   * as if that file pinned the latest epoch and the system-state `AGENTS.md` rules section were
   * `rules`, each list sorted as `check` prints it. A defect of a repository's inputs, a records
   * checkout that is not beside it included, is one finding of that repository.
   */
  judge(cwd: string, rules: string): Readonly<Record<RepositoryType, readonly Finding[]>>;
  /** Whether `section` is the `AGENTS.md` rules section in force at `epoch`, rewrapping aside. */
  holdsRulesOf(section: string, epoch: number): boolean;
}

/**
 * Refuses a `registry` pinned past `latest`, the latest epoch the `puni` of `version` knows.
 *
 * @throws RulesPinAhead naming both epochs and the version.
 */
export function requirePinReached(
  registry: RepositoryRegistry,
  latest: number,
  version: string,
): void {
  if (registry.rules > latest) {
    throw new RulesPinAhead({ details: { pin: registry.rules, latest, version } });
  }
}
