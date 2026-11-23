import type {
  Git,
  GitBranches,
  GitChange,
  GitListing,
  GitMerge,
  GitMerges,
  GitText,
  GitWorktree,
  GitWorktrees,
  ProcessRunner,
} from '@puni/shared-ports';

type GitRun = { readonly stdout: string } | { readonly failure: string };

/**
 * The {@link Git} of this machine, run in the root through `processRunner`. A git that cannot
 * start is `git could not run: <reason>`; a non-zero exit is
 * `git <command> exited <code>: <first stderr line>`. Visible files are
 * `git ls-files -z --cached --others --exclude-standard`, refused while
 * `git ls-files --unmerged` lists anything; staged files are
 * `git diff --cached --name-only -z --diff-filter=ACMR`, read with `git cat-file blob :<path>`; the
 * `HEAD` commit is `git rev-parse --short --verify HEAD`. Worktrees are
 * `git worktree list --porcelain -z`; branches `git for-each-ref` over `refs/heads/<prefix>`,
 * `--no-merged=HEAD` for unmerged ones; changed files `git status --porcelain -z
 * --untracked-files=all`; merges `git log --merges [--first-parent] --format=%H%x1f%ct%x1f%s`
 * with the revisions after `--end-of-options`, the time the committer time; the changes are `git worktree add -b`, `git worktree remove [--force]`
 * and `git branch -d` or `-D`.
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
  const change = (root: string, args: readonly string[]): GitChange => {
    const outcome = run(root, args);
    return 'failure' in outcome ? outcome : { changed: true };
  };
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
    listWorktrees(root): GitWorktrees {
      const listed = run(root, ['worktree', 'list', '--porcelain', '-z']);
      if ('failure' in listed) return listed;
      const worktrees: GitWorktree[] = [];
      for (const field of split(listed.stdout)) {
        if (field.startsWith('worktree '))
          worktrees.push({ path: field.slice('worktree '.length) });
        const last = worktrees.at(-1);
        if (field.startsWith('branch refs/heads/') && last !== undefined) {
          worktrees[worktrees.length - 1] = {
            ...last,
            branch: field.slice('branch refs/heads/'.length),
          };
        }
      }
      return { worktrees };
    },
    listBranches(root, prefix, filter): GitBranches {
      const listed = run(root, [
        'for-each-ref',
        '--format=%(refname:lstrip=2)',
        ...(filter === 'unmerged' ? ['--no-merged=HEAD'] : []),
        `refs/heads/${prefix}`,
      ]);
      if ('failure' in listed) return listed;
      return {
        branches: listed.stdout
          .split('\n')
          .filter((name) => name !== '')
          .sort(),
      };
    },
    listChangedFiles(root): GitListing {
      const status = run(root, ['status', '--porcelain', '-z', '--untracked-files=all']);
      if ('failure' in status) return status;
      const files: string[] = [];
      const fields = split(status.stdout);
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index] ?? '';
        files.push(field.slice(3));
        // A rename or copy is followed by the field of its original path.
        if (/^(?:[RC].|.[RC])/u.test(field)) index += 1;
      }
      return { files };
    },
    listMerges(root, revisions, ancestry): GitMerges {
      const logged = run(root, [
        'log',
        '--merges',
        ...(ancestry === 'first-parent' ? ['--first-parent'] : []),
        '--format=%H%x1f%ct%x1f%s',
        '--end-of-options',
        revisions,
        '--',
      ]);
      if ('failure' in logged) return logged;
      const merges: GitMerge[] = [];
      for (const line of logged.stdout.split('\n')) {
        if (line === '') continue;
        const [hash, seconds, subject, ...rest] = line.split('\x1f');
        if (
          hash === undefined ||
          seconds === undefined ||
          subject === undefined ||
          rest.length > 0 ||
          !/^[0-9]+$/u.test(seconds)
        ) {
          return { failure: `git log printed an unexpected line: ${JSON.stringify(line)}` };
        }
        merges.push({ hash, committedAt: new Date(Number(seconds) * 1000), subject });
      }
      return { merges };
    },
    addWorktree: (root, path, branch, from) =>
      change(root, ['worktree', 'add', '-q', '-b', branch, path, from]),
    removeWorktree: (root, path, force) =>
      change(root, ['worktree', 'remove', ...(force ? ['--force'] : []), path]),
    deleteBranch: (root, branch, force) => change(root, ['branch', force ? '-D' : '-d', branch]),
  };
}
