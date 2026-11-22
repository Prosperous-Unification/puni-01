import type { CommandBrief } from '../wiki/wiki-index';

/** What a rule judges: the repository, its paired repository and the composed CLI's commands. */
export interface RepositoryReading {
  readonly root: string;
  /** The paired repository, `owner/name`, as `puni.json` declares it. */
  readonly counterpart: string;
  readonly commands: readonly CommandBrief[];
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

/** The printed form of a finding: `<rule-id> <path>: <message>`. */
export function formatFinding(finding: Finding): string {
  return `${finding.rule} ${finding.path}: ${finding.message}`;
}
