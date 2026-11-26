import type { Command } from '@puni/shared-command';
import type {
  CheckoutFilesResource,
  ProjectSource,
  RepositoryRegistryResource,
} from '@puni/shared-checkout';

/**
 * A parsed `wiki map` request: print the root of the map, or with `partition` the wiki section or
 * partition it names.
 */
export interface WikiMapRequest {
  readonly kind: 'wiki map';
  readonly partition?: string | undefined;
}

/**
 * What printing the map gave: its text; an argument naming no section or partition the map
 * shows, with every one it does; or why it cannot be printed.
 */
export type WikiMapOutcome =
  | { readonly kind: 'printed'; readonly text: string }
  | {
      readonly kind: 'unknown';
      readonly argument: string;
      readonly partitions: readonly string[];
      readonly sections: readonly string[];
    }
  | { readonly kind: 'refused'; readonly reason: string };

/** The capability "print the map". */
export interface WikiMapPrinter {
  /**
   * Renders the root of the map of the system-state repository found from `cwd`, or with
   * `argument` the wiki section or partition it names, writing nothing.
   */
  print(cwd: string, argument: string | undefined): WikiMapOutcome;
}

/** What the wiki module needs from its host: the checkout resources and the project sources. */
export interface WikiRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly projectSources: readonly ProjectSource[];
}

/** What the wiki module exports. */
export interface WikiExports {
  readonly burokratWikiMapCommand: Command<WikiMapRequest>;
}
