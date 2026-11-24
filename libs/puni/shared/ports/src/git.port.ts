/** Paths relative to the repository root, or why git gave none. */
export type GitListing = { readonly files: readonly string[] } | { readonly failure: string };

/** The text of one file as git holds it, or why git gave none. */
export type GitText = { readonly text: string } | { readonly failure: string };

/** One worktree of a repository: its absolute path as git prints it, and its branch if any. */
export interface GitWorktree {
  readonly path: string;
  /** The branch checked out there, without `refs/heads/`; none when `HEAD` is detached. */
  readonly branch?: string | undefined;
}

/** The worktrees of a repository, the main one first, or why git gave none. */
export type GitWorktrees =
  { readonly worktrees: readonly GitWorktree[] } | { readonly failure: string };

/** Branch names without `refs/heads/`, or why git gave none. */
export type GitBranches = { readonly branches: readonly string[] } | { readonly failure: string };

/** One merge commit: its full hash, when it was committed, and its subject line. */
export interface GitMerge {
  readonly hash: string;
  readonly committedAt: Date;
  readonly subject: string;
}

/** Merge commits, newest first, or why git gave none. */
export type GitMerges = { readonly merges: readonly GitMerge[] } | { readonly failure: string };

/** Which ancestors of a revision a history walk follows: every parent, or only the first. */
export type GitAncestry = 'all' | 'first-parent';

/** One line a commit adds: the file's path, its line number in that commit, and its text. */
export interface GitAddedLine {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/**
 * One commit of a range: its hash abbreviated as git does, its whole message, and the lines it
 * adds against its first parent, or against nothing for a commit with no parent.
 */
export interface GitCommit {
  readonly hash: string;
  readonly message: string;
  readonly added: readonly GitAddedLine[];
}

/**
 * The commits of a range, oldest first; or the revision of it that names no commit; or why git
 * gave none.
 */
export type GitCommits =
  | { readonly commits: readonly GitCommit[] }
  | { readonly unknown: string }
  | { readonly failure: string };

/** A change git made, or why it made none. */
export type GitChange = { readonly changed: true } | { readonly failure: string };

/** Raw access to git. */
export interface Git {
  /**
   * The files git shows in the repository at `root`: tracked files, deleted or not, and
   * untracked files it does not ignore. A git that cannot run or fails, and an index holding
   * unmerged entries, is a `failure` naming the reason, never an empty or doubled list.
   */
  listVisibleFiles(root: string): GitListing;
  /** The files added, copied, modified or renamed in the index of the repository at `root`. */
  listStagedFiles(root: string): GitListing;
  /** The text the index of the repository at `root` holds for `path`. */
  readStagedText(root: string, path: string): GitText;
  /**
   * The abbreviated hash of the commit `HEAD` names in the repository at `root`, as its text; a
   * repository with no commit is a `failure`.
   */
  readHeadCommit(root: string): GitText;
  /** The worktrees of the repository at `root`, any of them: the main worktree first. */
  listWorktrees(root: string): GitWorktrees;
  /**
   * The branches of the repository at `root` under `prefix`, a ref path matched up to a slash
   * (`resources` holds `resources/a`, not `resourcesa`), sorted; with `unmerged`, only those
   * holding a commit the `HEAD` of `root` lacks.
   */
  listBranches(root: string, prefix: string, filter: 'all' | 'unmerged'): GitBranches;
  /**
   * The paths `git status` shows changed in the worktree at `root`: staged, unstaged and
   * untracked files it does not ignore; none for a clean worktree.
   */
  listChangedFiles(root: string): GitListing;
  /**
   * The merge commits `git log` reaches from `revisions` in the repository at `root`, a revision
   * or range such as `main` or `<hash>^1..<hash>`, following `ancestry`; an unknown revision is
   * a `failure`.
   */
  listMerges(root: string, revisions: string, ancestry: GitAncestry): GitMerges;
  /**
   * The commits `head` reaches and `base` does not in the repository at `root`, as
   * `git log base..head` lists them, oldest first, each with the lines it adds. A `base` or
   * `head` naming no commit is `unknown`, naming it.
   */
  listCommits(root: string, base: string, head: string): GitCommits;
  /** Adds a worktree at `path`, checking out a new `branch` that starts at the commit `from`. */
  addWorktree(root: string, path: string, branch: string, from: string): GitChange;
  /**
   * Removes the worktree at `path`; refused for a worktree with changes unless `force`, which
   * discards them.
   */
  removeWorktree(root: string, path: string, force: boolean): GitChange;
  /**
   * Deletes `branch`; refused for a branch not merged into `HEAD` unless `force`, which discards
   * its commits.
   */
  deleteBranch(root: string, branch: string, force: boolean): GitChange;
}
