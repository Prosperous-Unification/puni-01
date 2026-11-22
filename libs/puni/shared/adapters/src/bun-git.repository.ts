import type { Git, GitListing, GitText, ProcessRunner } from '@puni/shared-ports';

type GitRun = { readonly stdout: string } | { readonly failure: string };

/**
 * The {@link Git} of this machine, run in the root through `processRunner`. A git that cannot
 * start is `git could not run: <reason>`; a non-zero exit is
 * `git <command> exited <code>: <first stderr line>`. Visible files are
 * `git ls-files -z --cached --others --exclude-standard`, refused while
 * `git ls-files --unmerged` lists anything; staged files are
 * `git diff --cached --name-only -z --diff-filter=ACMR`, read with `git cat-file blob :<path>`; the
 * `HEAD` commit is `git rev-parse --short --verify HEAD`.
 */
export function createBunGit({ processRunner }: { processRunner: ProcessRunner }): Git {
  const run = (root: string, args: readonly string[]): GitRun => {
    const outcome = processRunner.run(['git', ...args], { cwd: root });
    if (outcome.kind === 'unstarted') return { failure: `git could not run: ${outcome.reason}` };
    if (outcome.exitCode !== 0) {
      const reason = outcome.stderr.trim().split('\n')[0] ?? '';
      return { failure: `git ${args[0] ?? ''} exited ${String(outcome.exitCode)}: ${reason}` };
    }
    return { stdout: outcome.stdout };
  };
  const split = (stdout: string): string[] => stdout.split('\0').filter((path) => path !== '');
  return {
    listVisibleFiles(root): GitListing {
      const unmerged = run(root, ['ls-files', '-z', '--unmerged']);
      if ('failure' in unmerged) return unmerged;
      const conflicted = [...new Set(split(unmerged.stdout).map((line) => line.split('\t')[1]))];
      if (conflicted.length > 0) {
        return { failure: `the git index has unmerged entries: ${conflicted.join(', ')}` };
      }
      const visible = run(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
      return 'failure' in visible ? visible : { files: split(visible.stdout) };
    },
    listStagedFiles(root): GitListing {
      const staged = run(root, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']);
      return 'failure' in staged ? staged : { files: split(staged.stdout) };
    },
    readStagedText(root, path): GitText {
      const blob = run(root, ['cat-file', 'blob', `:${path}`]);
      return 'failure' in blob ? blob : { text: blob.stdout };
    },
    readHeadCommit(root): GitText {
      const head = run(root, ['rev-parse', '--short', '--verify', 'HEAD']);
      return 'failure' in head ? head : { text: head.stdout.trim() };
    },
  };
}
