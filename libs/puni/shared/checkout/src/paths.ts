/** Whether the normalised relative POSIX path `path` leaves its root: it is `..` or starts `../`. */
export function leavesRoot(path: string): boolean {
  return path === '..' || path.startsWith('../');
}
