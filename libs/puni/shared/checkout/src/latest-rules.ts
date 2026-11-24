import type { Finding } from '@puni/shared-failures';

/**
 * Judging a system-state repository at the latest rules epoch this `puni` knows, as raising its
 * `rules` pin would leave it. The Burokrat check library supplies it, so a group that raises the
 * pin needs none of that library.
 */
export interface LatestRules {
  /** The latest rules epoch: the largest epoch that introduced or revised any rule. */
  readonly epoch: number;
  /**
   * The findings of every rule of {@link LatestRules.epoch} over the whole system-state
   * repository holding the nearest `puni.json` at or above `cwd`, judged as if that file pinned
   * the latest epoch and the `AGENTS.md` rules section were `rules`, sorted as `check` prints
   * them. A defect of the repository's inputs is one finding.
   */
  judge(cwd: string, rules: string): readonly Finding[];
}
