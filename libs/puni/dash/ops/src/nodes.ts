/** The node inventory, relative to the records repository root. */
export const nodeInventoryPath = 'dash/ops/nodes.json';

/** The role of the node that runs the k3s server, where `ops k3s` runs kubectl. */
export const k3sServerRole = 'k3s-server';

/** A node name: lower-case letters, digits and hyphens, starting with a letter or digit. */
export const nodeNamePattern = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * An SSH destination: one token from the operator's own SSH configuration, no whitespace, not
 * starting with `-`, so `ssh` can never read it as an option.
 */
export const sshDestinationPattern = /^[^\s-]\S*$/u;

/** A role: words of lower-case letters and digits joined by single hyphens, such as `k3s-server`. */
export const rolePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * `text` quoted for a POSIX shell as one word: wrapped in single quotes, each single quote inside
 * closed, escaped and reopened (`'\''`). Nothing inside single quotes is special, so spaces,
 * `$`, `;`, backslashes and newlines reach the program unchanged.
 */
export function quoteForPosixShell(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}
