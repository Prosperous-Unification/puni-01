import type { AcceptedOutcome, RemainderReason, UsageRow } from './contract';
import { readInstant } from './period';

/** Where a row's cost goes: to one outcome by a rule, or to the remainder with the reason. */
export type Attribution =
  | {
      readonly kind: 'outcome';
      readonly mergeHash: string;
      readonly rule: 'pull-request-reference' | 'branch';
    }
  | { readonly kind: 'remainder'; readonly reason: RemainderReason };

/** The branch outcomes merge into; work on it belongs to no one outcome. */
const defaultBranch = 'main';

/**
 * Attributes rows to `outcomes`. A row whose session links to exactly one accepted pull request,
 * a nested one included, goes to that outcome; links to several are `ambiguous-references`.
 * Otherwise its branch decides: none is `no-branch`, `main` is `on-default-branch`, and a branch
 * no outcome merged, as head or member, is `branch-not-accepted`. A branch several outcomes
 * merged goes to the first merged at or after the row, else the last.
 */
export function createAttribution(
  outcomes: readonly AcceptedOutcome[],
): (row: UsageRow, pullRequests: readonly number[]) => Attribution {
  const byPullRequest = new Map<number, AcceptedOutcome>();
  const byBranch = new Map<string, AcceptedOutcome[]>();
  for (const outcome of outcomes) {
    for (const pull of [outcome.pullRequest, ...outcome.nestedPullRequests]) {
      if (pull !== null) byPullRequest.set(pull, outcome);
    }
    for (const branch of [outcome.headBranch, ...outcome.memberBranches]) {
      if (branch !== null) byBranch.set(branch, [...(byBranch.get(branch) ?? []), outcome]);
    }
  }
  return (row, pullRequests) => {
    const referenced = new Set<string>();
    for (const pull of pullRequests) {
      const outcome = byPullRequest.get(pull);
      if (outcome !== undefined) referenced.add(outcome.mergeHash);
    }
    const [single, ...others] = referenced;
    if (single !== undefined && others.length === 0) {
      return { kind: 'outcome', mergeHash: single, rule: 'pull-request-reference' };
    }
    if (single !== undefined) return { kind: 'remainder', reason: 'ambiguous-references' };
    if (row.branch === null) return { kind: 'remainder', reason: 'no-branch' };
    if (row.branch === defaultBranch) return { kind: 'remainder', reason: 'on-default-branch' };
    const candidates = byBranch.get(row.branch) ?? [];
    const instant = readInstant(row.instant);
    const chosen =
      candidates.find((outcome) => readInstant(outcome.mergedAt) >= instant) ?? candidates.at(-1);
    if (chosen === undefined) return { kind: 'remainder', reason: 'branch-not-accepted' };
    return { kind: 'outcome', mergeHash: chosen.mergeHash, rule: 'branch' };
  };
}
