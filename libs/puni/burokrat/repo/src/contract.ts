import type { CheckoutFilesResource, RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Command, CommandCatalog, ProgramSource } from '@puni/shared-command';

/** A parsed `repo init` request: the new system's name and, if given, its GitHub owner. */
export interface RepoInitRequest {
  readonly kind: 'repo init';
  readonly name: string;
  readonly owner?: string | undefined;
}

/** A repository `repo init` created: its absolute root and the GitHub URL it is registered at. */
export interface CreatedRepository {
  readonly root: string;
  readonly url: string;
  /** Whether the root held a `.git` before, so it needs no `git init`. */
  readonly hasGit: boolean;
}

/**
 * What `repo init` did: the governed pair it created, a `refused` command line, or a
 * `defective` source checkout, each with its one-line reason.
 */
export type RepoInitOutcome =
  | {
      readonly kind: 'created';
      readonly state: CreatedRepository;
      readonly records: CreatedRepository;
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'defective'; readonly reason: string };

/** The capability "set up a governed repository pair". */
export interface RepositoryPairSetup {
  /**
   * Creates the system-state repository `request` names in the empty directory `cwd`, and its
   * records repository beside it.
   */
  init(cwd: string, request: RepoInitRequest): RepoInitOutcome;
}

/** What the repo module needs from its host. */
export interface RepoRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly commandCatalog: CommandCatalog;
  readonly programSource: ProgramSource;
}

/** What the repo module exports. */
export interface RepoExports {
  readonly burokratRepoInitCommand: Command<RepoInitRequest>;
}
