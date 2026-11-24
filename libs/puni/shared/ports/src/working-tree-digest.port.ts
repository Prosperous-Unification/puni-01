/** A fingerprint of git-visible changes to a commit, including untracked files. */
export interface WorkingTreeDigest {
  /** Returns the SHA-256 fingerprint, or throws with the path or git operation that failed. */
  read(root: string, commit: string): string;
}
