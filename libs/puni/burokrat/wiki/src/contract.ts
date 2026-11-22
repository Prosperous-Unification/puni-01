import type { Command, CommandCatalog } from '@puni/shared-command';
import type {
  CheckoutFilesResource,
  RepositoryRegistryResource,
  WikiIndexResource,
} from '@puni/shared-checkout';

/** A parsed `wiki index` request: write the index, or with `print` only print it. */
export interface WikiIndexRequest {
  readonly kind: 'wiki index';
  readonly print?: boolean | undefined;
}

/** What writing the index did: the changes it made, or why it wrote nothing. */
export type WikiIndexOutcome =
  | {
      readonly kind: 'written';
      readonly written: readonly string[];
      readonly removed: readonly string[];
    }
  | { readonly kind: 'refused'; readonly reason: string };

/** What rendering the index gave: every file of `wiki/index/` by path, or why there is none. */
export type WikiIndexRendering =
  | { readonly kind: 'rendered'; readonly files: ReadonlyMap<string, string> }
  | { readonly kind: 'refused'; readonly reason: string };

/** The capability "write the wiki index". */
export interface WikiIndexWriter {
  /** Regenerates `wiki/index/` of the system-state repository found from `cwd`. */
  write(cwd: string): WikiIndexOutcome;
  /** Renders `wiki/index/` of the system-state repository found from `cwd`, writing nothing. */
  render(cwd: string): WikiIndexRendering;
}

/** What the wiki module needs from its host. */
export interface WikiRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly checkoutWikiIndex: WikiIndexResource;
  readonly commandCatalog: CommandCatalog;
}

/** What the wiki module exports. */
export interface WikiExports {
  readonly burokratWikiIndexCommand: Command<WikiIndexRequest>;
}
