import { posix } from 'node:path';
import { leavesRoot, repositoryScope } from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule } from '../finding';
import { holdsAddress, holdsCredential } from './secrets.rule';

/**
 * `target` as a finding prints it: itself, unless it holds what `secrets.plaintext` or
 * `secrets.addresses` refuses to print, which those rules report.
 */
function showTarget(target: string): string {
  return holdsCredential(target) || holdsAddress(target)
    ? 'a target the secrets rules refuse to print'
    : target;
}

/** How to take out an entry the repository may not hold. */
const removal = (path: string): string => `remove it: git rm --cached ${path}`;

/**
 * Every git index entry the scope owns is a regular file, or a symlink whose target is relative,
 * stays inside the repository and is a tracked regular file, as `CLAUDE.md` to `AGENTS.md` is.
 * Git modes decide, whatever the working tree holds, so the entries no visible listing shows
 * are judged here. A symlink to an absolute path, one leaving the repository, one to anything
 * but a tracked file, and every gitlink, are breaches; a symlink's breach names its target,
 * unless the target holds a credential or an address, which the secrets rules report. A
 * missing target is judged among the references the run reaches, so one in another project is
 * the cross-project run's; every other breach is the owning project's alone.
 */
export const judgeEntryKinds: Rule = {
  id: 'entries.kind',
  remedy:
    'point the symlink at a tracked file inside the repository by a relative path (ln -sfn <relative-target> <path>), or remove it',
  judge({ files, scope, references }) {
    const ownRun = references.kind !== 'cross-project';
    const tracked = new Set(
      files
        .listIndexEntries(repositoryScope)
        .filter(({ kind }) => kind === 'file')
        .map(({ path }) => path),
    );
    return files.listIndexEntries(scope).flatMap((entry): Breach[] => {
      const { path } = entry;
      if (entry.kind === 'file') return [];
      if (entry.kind === 'gitlink') {
        if (!ownRun) return [];
        return [
          {
            path,
            message: 'is a gitlink, a commit of another repository, which no rule here can judge',
            remedy: `${removal(path)}, and copy in the files it needs or reach the repository through puni.json`,
          },
        ];
      }
      const { target } = entry;
      const shown = showTarget(target);
      if (posix.isAbsolute(target)) {
        return ownRun ? [{ path, message: `is a symlink to the absolute path ${shown}` }] : [];
      }
      const resolved = posix.normalize(posix.join(posix.dirname(path), target));
      if (leavesRoot(resolved)) {
        return ownRun
          ? [{ path, message: `is a symlink to ${shown}, which leaves the repository` }]
          : [];
      }
      if (!reachesReference(references, path, resolved) || tracked.has(resolved)) return [];
      return [
        {
          path,
          message: `is a symlink to ${shown}, which is no tracked file`,
          remedy: `point it at a tracked file, or ${removal(path)}`,
        },
      ];
    });
  },
};
