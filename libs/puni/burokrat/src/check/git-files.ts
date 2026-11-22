/** Paths `git ls-files` printed, relative to the repository root, or why git gave none. */
export type GitListing = { readonly files: readonly string[] } | { readonly failure: string };

/**
 * Runs `git ls-files -z <options>` in `root`. A git that cannot run or exits non-zero is a
 * `failure` naming the reason, never an empty list.
 */
export function listGitFiles(root: string, options: readonly string[]): GitListing {
  let child;
  try {
    child = Bun.spawnSync(['git', 'ls-files', '-z', ...options], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { failure: `git could not run: ${reason}` };
  }
  if (child.exitCode !== 0) {
    const reason = child.stderr.toString().trim().split('\n')[0] ?? '';
    return { failure: `git ls-files exited ${String(child.exitCode)}: ${reason}` };
  }
  return {
    files: child.stdout
      .toString()
      .split('\0')
      .filter((path) => path !== ''),
  };
}
