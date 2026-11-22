import type { Command, CommandCatalog } from '@puni/shared-command';
import type {
  CheckoutFilesResource,
  ProjectScopeResource,
  RepositoryRegistryResource,
  RepositoryType,
  WikiIndexResource,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import type { RecordsCatalog } from '@puni/shared-records';

/** A parsed `check` request: the repository type to judge and the project to scope it to. */
export interface CheckRequest {
  readonly repo?: RepositoryType | undefined;
  readonly project?: string | undefined;
}

/** What one check found: a summary naming what was judged, and every finding sorted. */
export interface CheckVerdict {
  readonly summary: string;
  readonly findings: readonly Finding[];
}

/** The capability "judge a repository". */
export interface RepositoryCheck {
  /**
   * Judges the repository a `check` request names, starting the search for `puni.json` at
   * `cwd`. A defect of the repository's own inputs is one finding.
   *
   * @throws ProjectUnknown when `project` names no project.
   * @throws ProjectScopeRefused when `project` is given for a repository other than
   *   `system-state`.
   */
  check(request: CheckRequest, cwd: string): CheckVerdict;
}

/** What the check module needs from its host. */
export interface CheckRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly checkoutProjectScope: ProjectScopeResource;
  readonly checkoutWikiIndex: WikiIndexResource;
  readonly recordsCatalog: RecordsCatalog;
  readonly commandCatalog: CommandCatalog;
}

/** What the check module exports. */
export interface CheckExports {
  readonly burokratCheckCommand: Command<CheckRequest>;
}
