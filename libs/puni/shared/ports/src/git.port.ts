/** Paths relative to the repository root, or why git gave none. */
export type GitListing = { readonly files: readonly string[] } | { readonly failure: string };

/** Raw access to git. */
export interface Git {
  /**
   * The files git shows in the repository at `root`: tracked files, deleted or not, and
   * untracked files it does not ignore. A git that cannot run or fails is a `failure` naming the
   * reason, never an empty list.
   */
  listVisibleFiles(root: string): GitListing;
}
