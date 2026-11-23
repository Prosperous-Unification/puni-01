import type { Git, GitMerge } from '@puni/shared-ports';
import type { AcceptedOutcome, AcceptedOutcomesResource } from './contract';
import { OutcomesUnreadable } from './failures';
import { readMergeSubject } from './merge-subject';
import { isInPeriod } from './period';

/** What the accepted outcomes resource needs from its host. */
export interface AcceptedOutcomesRequirements {
  readonly git: Git;
}

/** The branch whose first-parent merges are the accepted outcomes. */
const acceptingBranch = 'main';

/**
 * The {@link AcceptedOutcomesResource} of `git`. An outcome is a first-parent merge into `main`
 * committed in the period, whether or not its subject names a pull request, so the count of
 * outcomes is the count of merges. Its nested pull requests and member branches are those of
 * the merges `<hash>^1..<hash>` reaches whose subjects name pull requests: what a plan branch
 * gathered before it was merged.
 */
export function createAcceptedOutcomes({
  git,
}: AcceptedOutcomesRequirements): AcceptedOutcomesResource {
  const listMerges = (
    root: string,
    revisions: string,
    ancestry: 'all' | 'first-parent',
  ): readonly GitMerge[] => {
    const listed = git.listMerges(root, revisions, ancestry);
    if ('failure' in listed) {
      throw new OutcomesUnreadable({ details: { root, reason: listed.failure } });
    }
    return listed.merges;
  };
  return {
    list(root, period) {
      return listMerges(root, acceptingBranch, 'first-parent')
        .filter(({ committedAt }) => isInPeriod(committedAt.getTime(), period))
        .map(({ hash, committedAt, subject }): AcceptedOutcome => {
          const named = readMergeSubject(subject);
          const nested = listMerges(root, `${hash}^1..${hash}`, 'all')
            .filter((merge) => merge.hash !== hash)
            .flatMap((merge) => readMergeSubject(merge.subject) ?? []);
          return {
            mergeHash: hash,
            mergedAt: committedAt.toISOString(),
            subject,
            pullRequest: named?.pullRequest ?? null,
            headBranch: named?.branch ?? null,
            nestedPullRequests: [...new Set(nested.map(({ pullRequest }) => pullRequest))].sort(
              (left, right) => left - right,
            ),
            memberBranches: [...new Set(nested.map(({ branch }) => branch))].sort(),
          };
        })
        .sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));
    },
  };
}
