import type { RepositoryRegistry } from '../registry';
import type { CommandBrief } from '../wiki/wiki-index';
import type { CheckScope } from './scope';

/**
 * What a rule judges: the repository, the project's registry, the composed CLI's commands, and
 * the scope of the run. A project-level rule judges only what its scope owns.
 */
export interface RepositoryReading {
  readonly root: string;
  /** The project's repositories by role, as the system-state `puni.json` registers them. */
  readonly registry: RepositoryRegistry;
  readonly commands: readonly CommandBrief[];
  readonly scope: CheckScope;
}

/** One broken rule at one repository path. */
export interface Finding {
  /** A stable `subject.rule` id. */
  readonly rule: string;
  /** Relative to the repository root. */
  readonly path: string;
  readonly message: string;
}

/** A rule: a small function from a repository reading to its findings, empty when it holds. */
export type Rule = (repository: RepositoryReading) => Finding[];

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
