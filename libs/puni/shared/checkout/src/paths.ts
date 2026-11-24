/** Whether the normalised relative POSIX path `path` leaves its root: it is `..` or starts `../`. */
export function leavesRoot(path: string): boolean {
  return path === '..' || path.startsWith('../');
}

/**
 * The path a commit's view of a range gives its message: parenthesised, so a finding in it reads
 * as no file of the commit.
 */
export const commitMessagePath = '(commit message)';
