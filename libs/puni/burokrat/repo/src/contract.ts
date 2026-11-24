import type {
  CheckoutFilesResource,
  LatestRules,
  RepositoryRegistryResource,
} from '@puni/shared-checkout';
import type { Command, CommandCatalog, ProgramSource } from '@puni/shared-command';
import type { Finding } from '@puni/shared-failures';

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

/** A parsed `repo upgrade` request: it takes no options. */
export interface RepoUpgradeRequest {
  readonly kind: 'repo upgrade';
}

/**
 * What `repo upgrade` did: raised the pin `from` one epoch `to` the latest, found the pin
 * already `current`, found the repository `failing` the latest rules and changed nothing, or a
 * `refused` pin or `defective` repository, each with its one-line reason.
 */
export type RepoUpgradeOutcome =
  | { readonly kind: 'upgraded'; readonly from: number; readonly to: number }
  | { readonly kind: 'current'; readonly epoch: number }
  | {
      readonly kind: 'failing';
      readonly from: number;
      readonly to: number;
      readonly findings: readonly Finding[];
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'defective'; readonly reason: string };

/** The capability "raise a repository's rules pin to the latest epoch". */
export interface RulesPinUpgrade {
  /** Raises the pin of the system-state repository of the nearest `puni.json` at or above `cwd`. */
  upgrade(cwd: string): RepoUpgradeOutcome;
}

/** What the repo module needs from its host. */
export interface RepoRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly commandCatalog: CommandCatalog;
  readonly programSource: ProgramSource;
  readonly latestRules: LatestRules;
}

/** What the repo module exports. */
export interface RepoExports {
  readonly burokratRepoInitCommand: Command<RepoInitRequest>;
  readonly burokratRepoUpgradeCommand: Command<RepoUpgradeRequest>;
}
