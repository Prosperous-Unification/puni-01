import { describeCause } from '@puni/shared-failures';
import type { ProcessRunner, WorkingTreeDigest } from '@puni/shared-ports';
import type { ReviewSource } from './contract';
import { ReviewInputFailed } from './failures';

/** Pins the full commit and fingerprints explicit working tree reviews. */
export function createReviewSource({
  processRunner,
  workingTreeDigest,
}: {
  readonly processRunner: ProcessRunner;
  readonly workingTreeDigest: WorkingTreeDigest;
}): ReviewSource {
  function snapshotOf(root: string, commit: string): string {
    try {
      return workingTreeDigest.read(root, commit);
    } catch (cause) {
      throw new ReviewInputFailed({
        details: {
          reason: `cannot fingerprint the working tree in ${root}: ${describeCause(cause)}`,
        },
        cause,
      });
    }
  }

  function head(root: string): string {
    const git = processRunner.run(['git', 'rev-parse', '--verify', 'HEAD'], { cwd: root });
    if (git.kind === 'unstarted')
      throw new ReviewInputFailed({
        details: { reason: `cannot read HEAD in ${root}: ${git.reason}` },
      });
    const commit = git.stdout.trim();
    if (git.exitCode !== 0 || !/^[a-f0-9]{40}$/u.test(commit)) {
      throw new ReviewInputFailed({
        details: {
          reason: `cannot read HEAD in ${root}: ${git.stderr.trim() || 'expected a full git commit hash'}`,
        },
      });
    }
    return commit;
  }

  return {
    capture(root, workingTree) {
      const commit = head(root);
      return workingTree ? { commit, snapshot: snapshotOf(root, commit) } : { commit };
    },
    verify({ snapshot, root, commit }) {
      if (snapshot === undefined) return;
      if (head(root) !== commit || snapshotOf(root, commit) !== snapshot) {
        throw new ReviewInputFailed({
          details: {
            reason:
              'the working tree changed since the review started; start a new review of the current snapshot',
          },
        });
      }
    },
  };
}
