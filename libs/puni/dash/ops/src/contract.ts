import type { Command } from '@puni/shared-command';
import type {
  CheckoutFiles,
  CheckoutFilesResource,
  RepositoryRegistryResource,
} from '@puni/shared-checkout';

/** A parsed `ops ssh` request: the node, and the command to run there, none for a shell. */
export interface SshRequest {
  readonly kind: 'ops ssh';
  readonly node: string;
  readonly command: readonly string[];
}

/** A parsed `ops k3s` request: the arguments `k3s kubectl` is given, at least one. */
export interface K3sRequest {
  readonly kind: 'ops k3s';
  readonly args: readonly string[];
}

/** One node of the inventory: its name, the SSH alias that reaches it, and its roles. */
export interface OpsNode {
  readonly name: string;
  readonly ssh: string;
  readonly roles: readonly string[];
}

/** The node inventory, `dash/ops/nodes.json` of the records repository. */
export interface NodeInventoryResource {
  /**
   * The node named `name` in the inventory of the records checkout `files`.
   *
   * @throws NodeInventoryMissing when the inventory file does not exist.
   * @throws FileUnreadable when it exists but cannot be read.
   * @throws NodeInventoryInvalid naming the problem when it is not a valid inventory.
   * @throws NodeUnknown listing the known names when no node has that name.
   */
  find(files: CheckoutFiles, name: string): OpsNode;
  /**
   * The one node holding `role`, read as {@link NodeInventoryResource.find} reads.
   *
   * @throws NodeRoleNotSingle when no node or more than one holds it.
   */
  findByRole(files: CheckoutFiles, role: string): OpsNode;
}

/** How a remote command ended: the exit code `ssh` returned, or why `ssh` never started. */
export type RemoteShellOutcome =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'unstarted'; readonly reason: string };

/** A shell on a node, reached through `ssh` attached to this terminal. */
export interface RemoteShellResource {
  /**
   * Runs `ssh <destination>` from `cwd`, an interactive shell, when `command` is empty; else
   * `ssh <destination> -- <command>`, each argument quoted for the remote POSIX shell.
   */
  run(destination: string, command: readonly string[], cwd: string): RemoteShellOutcome;
}

/**
 * What asking a node for a shell did: the remote outcome once `ssh` was asked to start, a
 * `refused` command line, or a `defective` records repository, each with its one-line reason.
 */
export type NodeShellOutcome =
  | RemoteShellOutcome
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'defective'; readonly reason: string };

/** The capability "open a shell on a node". */
export interface NodeShell {
  /** Runs `command` on the node named `node`, or opens a shell there; `cwd` finds the records. */
  open(cwd: string, node: string, command: readonly string[]): NodeShellOutcome;
  /** Runs `k3s kubectl <args>` on the node holding the role `k3s-server`. */
  runKubectl(cwd: string, args: readonly string[]): NodeShellOutcome;
}

/**
 * What the ops module needs from its host: these checkout resources, and `processRunner`, which
 * the remote shell names in `RemoteShellRequirements` because only a resource sees the ports.
 */
export interface OpsRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
}

/** What the ops module exports. */
export interface OpsExports {
  readonly dashOpsSshCommand: Command<SshRequest>;
  readonly dashOpsK3sCommand: Command<K3sRequest>;
}
