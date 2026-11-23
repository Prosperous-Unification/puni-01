import type { Command } from '@puni/shared-command';
import type { RepositoryRegistryResource } from '@puni/shared-checkout';

/** A parsed `resources create` request: the new resource's name and the commit it starts at. */
export interface CreateRequest {
  readonly kind: 'resources create';
  readonly name: string;
  /** A commit, branch or other ref of the system-state repository. */
  readonly from: string;
}

/** A parsed `resources list` request. */
export interface ListRequest {
  readonly kind: 'resources list';
}

/** A parsed `resources exec` request: the resource, and the command to run in it. */
export interface ExecRequest {
  readonly kind: 'resources exec';
  readonly name: string;
  readonly command: readonly string[];
}

/** A parsed `resources remove` request; `force` discards changes and unmerged commits. */
export interface RemoveRequest {
  readonly kind: 'resources remove';
  readonly name: string;
  readonly force: boolean;
}

/**
 * A resource: a disposable git worktree of the system-state repository at
 * `<main worktree>/.worktrees/<name>`, on the branch `resources/<name>`. A worktree anywhere
 * else, or on any other branch, is never a resource.
 */
export interface ResourceWorktree {
  readonly name: string;
  readonly branch: string;
  /** Its absolute path, as git spells it. */
  readonly path: string;
  /** Whether `git status` shows nothing changed in it. */
  readonly clean: boolean;
}

/** How a command run in a resource ended: its exit code, or why it never started. */
export type ResourceRunOutcome =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'unstarted'; readonly reason: string };

/** The resources of one system-state repository, reached through git. */
export interface ResourceWorktreesResource {
  /**
   * The main worktree of the repository whose worktree is `root`.
   *
   * @throws ResourceGitFailed when git cannot list the worktrees.
   */
  findMain(root: string): string;
  /**
   * The resources of the repository whose main worktree is `main`, sorted by name.
   *
   * @throws ResourceGitFailed when git cannot list the worktrees or their changes.
   */
  list(main: string): readonly ResourceWorktree[];
  /**
   * The resource `name`, read as {@link ResourceWorktreesResource.list} reads.
   *
   * @throws ResourceUnknown listing the resources when none is called `name`.
   */
  find(main: string, name: string): ResourceWorktree;
  /**
   * Creates the resource `name` on a new branch starting at `from`.
   *
   * @throws ResourceNameRefused when `name` is not lower-case letters and digits joined by
   *   single hyphens.
   * @throws ResourceExists when a worktree already stands at its path or its branch exists.
   * @throws ResourceGitFailed when git cannot list or add it, an unknown `from` included.
   */
  create(main: string, name: string, from: string): ResourceWorktree;
  /**
   * Removes the resource `name` and its branch. Without `force`, a worktree with changes or a
   * branch holding a commit the main worktree's `HEAD` lacks is refused before anything is
   * removed; with `force`, both are discarded.
   *
   * @throws ResourceUnknown listing the resources when none is called `name`.
   * @throws ResourceNotDisposable naming every reason when it is refused.
   * @throws ResourceGitFailed when git cannot list or remove it.
   */
  remove(main: string, name: string, force: boolean): ResourceWorktree;
  /** Runs `command` in the worktree at `path`, attached to this terminal. */
  run(path: string, command: readonly string[]): ResourceRunOutcome;
}

/**
 * What a resources command did: `done` with its result, a `refused` command line, or a `failed`
 * repository or git, each with its one-line reason.
 */
export type ResourcesOutcome<Done> =
  | { readonly kind: 'done'; readonly done: Done }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

/** The capability "manage disposable worktrees of the system-state repository". */
export interface Resources {
  /** Creates the resource `name` starting at `from`; `cwd` finds the system-state repository. */
  create(cwd: string, name: string, from: string): ResourcesOutcome<ResourceWorktree>;
  /** Every resource of the system-state repository found from `cwd`. */
  list(cwd: string): ResourcesOutcome<readonly ResourceWorktree[]>;
  /** Runs `command` in the resource `name`, attached to this terminal. */
  exec(cwd: string, name: string, command: readonly string[]): ResourcesOutcome<ResourceRunOutcome>;
  /** Removes the resource `name` and its branch; `force` discards what would be lost. */
  remove(cwd: string, name: string, force: boolean): ResourcesOutcome<ResourceWorktree>;
}

/**
 * What the resources module needs from its host: the registry, and `git` and `processRunner`,
 * which the worktrees resource names in `ResourceWorktreesRequirements` because only a resource
 * sees the ports.
 */
export interface ResourcesRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
}

/** What the resources module exports. */
export interface ResourcesExports {
  readonly dashResourcesCreateCommand: Command<CreateRequest>;
  readonly dashResourcesListCommand: Command<ListRequest>;
  readonly dashResourcesExecCommand: Command<ExecRequest>;
  readonly dashResourcesRemoveCommand: Command<RemoveRequest>;
}
