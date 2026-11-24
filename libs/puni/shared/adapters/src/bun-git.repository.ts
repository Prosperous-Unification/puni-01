import type {
  Git,
  GitAddedLine,
  GitBranches,
  GitChange,
  GitCommit,
  GitCommits,
  GitListing,
  GitMerge,
  GitMerges,
  GitText,
  GitWorktree,
  GitWorktrees,
  ProcessOutcome,
  ProcessRunner,
} from '@puni/shared-ports';

type GitRun = { readonly stdout: string } | { readonly failure: string };

/** What a git run of `args` that ended as `outcome` printed, or why it failed. */
function readRun(args: readonly string[], outcome: ProcessOutcome): GitRun {
  if (outcome.kind === 'unstarted') return { failure: `git could not run: ${outcome.reason}` };
  if (outcome.exitCode !== 0) {
    const reason = outcome.stderr.trim().split('\n')[0] ?? '';
    return { failure: `git ${args[0] ?? ''} exited ${String(outcome.exitCode)}: ${reason}` };
  }
  return { stdout: outcome.stdout };
}

/** The escapes git writes inside a quoted path, by the letter after the backslash. */
const pathEscapes: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
};

/**
 * A path as a diff header prints it: bare, or quoted with C escapes and octal bytes when it holds
 * a character git quotes; `undefined` for a quoted path git would not write.
 */
function unquotePath(printed: string): string | undefined {
  if (!printed.startsWith('"')) return printed;
  if (printed.length < 2 || !printed.endsWith('"')) return undefined;
  const bytes: number[] = [];
  const body = printed.slice(1, -1);
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] ?? '';
    if (char !== '\\') {
      bytes.push(...new TextEncoder().encode(char));
      continue;
    }
    const octal = /^[0-7]{3}/u.exec(body.slice(index + 1))?.[0];
    const escaped = pathEscapes[body[index + 1] ?? ''];
    if (octal !== undefined) {
      bytes.push(parseInt(octal, 8));
      index += 3;
    } else if (escaped !== undefined) {
      bytes.push(escaped);
      index += 1;
    } else {
      return undefined;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * The lines a zero-context patch adds, each with its path and its line number in the new file;
 * a patch git would not print is the line it cannot read.
 */
function readAddedLines(patch: string): readonly GitAddedLine[] | { readonly unreadable: string } {
  const added: GitAddedLine[] = [];
  let path: string | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  let next = 0;
  for (const line of patch.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      const mark = line[0];
      if (mark === '\\') continue;
      if (mark === '-' && oldLeft > 0) {
        oldLeft -= 1;
        continue;
      }
      if (mark !== '+' || newLeft === 0 || path === undefined) return { unreadable: line };
      added.push({ path, line: next, text: line.slice(1) });
      newLeft -= 1;
      next += 1;
      continue;
    }
    if (line.startsWith('+++ ')) {
      // Git ends a header path holding a space with a tab; a tab in a path is quoted.
      const printed = line.slice('+++ '.length).replace(/\t$/u, '');
      const target = printed === '/dev/null' ? '' : unquotePath(printed);
      if (target === undefined) return { unreadable: line };
      path = target.startsWith('b/') ? target.slice(2) : undefined;
      continue;
    }
    if (line.startsWith('@@ ')) {
      const counts = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
      if (counts === null) return { unreadable: line };
      oldLeft = Number(counts[1] ?? '1');
      next = Number(counts[2]);
      newLeft = Number(counts[3] ?? '1');
    }
  }
  if (oldLeft > 0 || newLeft > 0) return { unreadable: 'the patch ends inside a hunk' };
  return added;
}

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
 * and `git branch -d` or `-D`. A commit range is checked end by end with
 * `git rev-parse --verify --quiet <rev>^{commit}`, whose exit 1 is an unknown revision, then listed
 * with `git rev-list --reverse --abbrev-commit`; each commit's message is `git show -s --format=format:%B`,
 * its added lines `git diff-tree -p -U0 --root --diff-merges=first-parent --no-renames`, with
 * fixed `a/` and `b/` prefixes and no external diff or text conversion. Every revision follows
 * `--end-of-options`, so none is read as an option.
 */
export function createBunGit({ processRunner }: { processRunner: ProcessRunner }): Git {
  const run = (root: string, args: readonly string[]): GitRun =>
    readRun(args, processRunner.run(['git', ...args], { cwd: root }));
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
    listCommits(root, base, head): GitCommits {
      for (const revision of [base, head]) {
        const verify = [
          'rev-parse',
          '--verify',
          '--quiet',
          '--end-of-options',
          `${revision}^{commit}`,
        ];
        const outcome = processRunner.run(['git', ...verify], { cwd: root });
        if (outcome.kind === 'exited' && outcome.exitCode === 1) return { unknown: revision };
        const verified = readRun(verify, outcome);
        if ('failure' in verified) return verified;
      }
      const listed = run(root, [
        'rev-list',
        '--reverse',
        '--abbrev-commit',
        '--end-of-options',
        `${base}..${head}`,
        '--',
      ]);
      if ('failure' in listed) return listed;
      const commits: GitCommit[] = [];
      for (const hash of listed.stdout.split('\n').filter((line) => line !== '')) {
        const message = run(root, [
          'show',
          '-s',
          '--format=format:%B',
          '--end-of-options',
          hash,
          '--',
        ]);
        if ('failure' in message) return message;
        const patch = run(root, [
          'diff-tree',
          '-p',
          '-U0',
          '-r',
          '--root',
          '--no-commit-id',
          '--diff-merges=first-parent',
          '--no-renames',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--src-prefix=a/',
          '--dst-prefix=b/',
          '--end-of-options',
          hash,
          '--',
        ]);
        if ('failure' in patch) return patch;
        const added = readAddedLines(patch.stdout);
        if ('unreadable' in added) {
          return {
            failure: `git diff-tree printed an unexpected line for ${hash}: ${JSON.stringify(added.unreadable)}`,
          };
        }
        commits.push({ hash, message: message.stdout, added });
      }
      return { commits };
    },
    addWorktree: (root, path, branch, from) =>
      change(root, ['worktree', 'add', '-q', '-b', branch, path, from]),
    removeWorktree: (root, path, force) =>
      change(root, ['worktree', 'remove', ...(force ? ['--force'] : []), path]),
    deleteBranch: (root, branch, force) => change(root, ['branch', force ? '-D' : '-d', branch]),
  };
}
