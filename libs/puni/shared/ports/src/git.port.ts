/** Paths relative to the repository root, or why git gave none. */
export type GitListing = { readonly files: readonly string[] } | { readonly failure: string };

/** The text of one file as git holds it, or why git gave none. */
export type GitText = { readonly text: string } | { readonly failure: string };

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
}
