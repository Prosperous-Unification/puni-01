import type { CheckoutFilesResource, RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Command } from '@puni/shared-command';
import type { RecordsCatalog } from '@puni/shared-records';

/** A parsed `plan add` request: the plan's title, topics and summary, and its body file. */
export interface PlanAddRequest {
  readonly kind: 'plan add';
  readonly title: string;
  /** Comma-separated topics. */
  readonly topics: string;
  readonly summary: string;
  /** The file holding the body, relative to the directory the command started from. */
  readonly bodyFile?: string | undefined;
}

/**
 * What filing a plan did: the record's path relative to the records checkout, a `refused`
 * command line, or a `defective` repository, each with its one-line reason.
 */
export type PlanFilingOutcome =
  | { readonly kind: 'filed'; readonly path: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'defective'; readonly reason: string };

/** The capability "file a plan". */
export interface PlanFiling {
  /** Files the plan `request` describes in the records repository found from `cwd`. */
  file(cwd: string, request: PlanAddRequest): PlanFilingOutcome;
}

/** What the plan module needs from its host. */
export interface PlanRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly recordsCatalog: RecordsCatalog;
}

/** What the plan module exports. */
export interface PlanExports {
  readonly navigatorPlanAddCommand: Command<PlanAddRequest>;
}
