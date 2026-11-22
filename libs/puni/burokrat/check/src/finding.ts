import type { CommandBrief } from '@puni/shared-command';
import type {
  CheckoutFiles,
  CheckScope,
  RepositoryRegistry,
  WikiIndexResource,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import type { RecordsCatalog } from '@puni/shared-records';

export type { Finding };

/**
 * What a rule judges: the checkout, the project's registry, the composed CLI's commands, the
 * scope of the run, and the resources that read the index sources and the records. A
 * project-level rule judges only what its scope owns.
 */
export interface RuleReading {
  readonly files: CheckoutFiles;
  /** The project's repositories by role, as the system-state `puni.json` registers them. */
  readonly registry: RepositoryRegistry;
  readonly commands: readonly CommandBrief[];
  readonly scope: CheckScope;
  readonly wikiIndex: WikiIndexResource;
  readonly records: RecordsCatalog;
}

/** A rule: a small function from a reading to its findings, empty when it holds. */
export type Rule = (reading: RuleReading) => Finding[];

/**
 * A rule and the level it judges at. A `repository` rule runs only for the whole repository and
 * the root project; a `project` rule runs in every scope and judges only what the scope owns, so
 * each finding comes from exactly one project.
 */
export interface LeveledRule {
  readonly level: 'repository' | 'project';
  readonly judge: Rule;
}

/** The printed form of a finding: `<rule-id> <path>: <message>`. */
export function formatFinding(finding: Finding): string {
  return `${finding.rule} ${finding.path}: ${finding.message}`;
}
