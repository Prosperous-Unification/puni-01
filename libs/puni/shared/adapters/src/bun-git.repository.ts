import type { Git, ProcessRunner } from '@puni/shared-ports';

/**
 * The {@link Git} of this machine: `git ls-files -z --cached --others --exclude-standard` run in
 * the root through `processRunner`. A git that cannot start is `git could not run: <reason>`; a
 * non-zero exit is `git ls-files exited <code>: <first stderr line>`.
 */
export function createBunGit({ processRunner }: { processRunner: ProcessRunner }): Git {
  return {
    listVisibleFiles(root) {
      const outcome = processRunner.run(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        { cwd: root },
      );
      if (outcome.kind === 'unstarted') return { failure: `git could not run: ${outcome.reason}` };
      if (outcome.exitCode !== 0) {
        const reason = outcome.stderr.trim().split('\n')[0] ?? '';
        return { failure: `git ls-files exited ${String(outcome.exitCode)}: ${reason}` };
      }
      return { files: outcome.stdout.split('\0').filter((path) => path !== '') };
    },
  };
}
