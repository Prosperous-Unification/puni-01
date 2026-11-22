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

/**
 * A parsed `check` request: the repository type to judge, and at most one choice of what in it to
 * judge: one project, only the references crossing projects, or only the staged files.
 */
export interface CheckRequest {
  readonly repo?: RepositoryType | undefined;
  readonly project?: string | undefined;
  readonly crossProjectLinks?: boolean | undefined;
  readonly staged?: boolean | undefined;
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
   * @throws ProjectScopeRefused when `project` or `crossProjectLinks` is given for a repository
   *   other than `system-state`.
   * @throws ScopeOptionsConflict when more than one of `project`, `crossProjectLinks` and
   *   `staged` is given.
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
