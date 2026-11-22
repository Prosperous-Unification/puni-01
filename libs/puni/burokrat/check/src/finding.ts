import type { CommandBrief } from '@puni/shared-command';
import {
  type CheckoutFiles,
  type CheckScope,
  findOwner,
  type Project,
  type RepositoryRegistry,
  type WikiIndexResource,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import type { RecordsCatalog } from '@puni/shared-records';

export type { Finding };

/**
 * Which references from a file to another path (Markdown links, backticked paths) a run judges:
 * every one, only those whose target the linking file's project owns, or only those leaving it.
 * A reference is judged where its existence is cached correctly: within a project by that
 * project's check, across projects by the cross-project run, which reads every file.
 */
export type ReferenceReach =
  | { readonly kind: 'all' }
  | { readonly kind: 'within-project'; readonly projects: readonly Project[] }
  | { readonly kind: 'cross-project'; readonly projects: readonly Project[] };

/**
 * What a rule judges: the checkout, the project's registry, the composed CLI's commands, the
 * scope of the run, the references it reaches, and the resources that read the index sources
 * and the records. A project-level rule judges only what its scope owns.
 */
export interface RuleReading {
  readonly files: CheckoutFiles;
  /** The project's repositories by role, as the system-state `puni.json` registers them. */
  readonly registry: RepositoryRegistry;
  readonly commands: readonly CommandBrief[];
  readonly scope: CheckScope;
  readonly references: ReferenceReach;
  readonly wikiIndex: WikiIndexResource;
  readonly records: RecordsCatalog;
}

/** One place a rule does not hold; `remedy` replaces the rule's own for this breach alone. */
export interface Breach {
  readonly path: string;
  readonly message: string;
  readonly remedy?: string;
}

/** A rule: a stable id, what to do when it breaks, and a judgement that is empty when it holds. */
export interface Rule {
  /** A stable `subject.rule` id. */
  readonly id: string;
  /** What to do about a breach, in the imperative, naming the command when one exists. */
  readonly remedy: string;
  judge(reading: RuleReading): readonly Breach[];
}

/**
 * The level a rule judges at. A `whole` rule runs only when the whole repository is judged; a
 * `repository` rule also runs for the root project; a `project` rule runs in every scope and
 * judges only what the scope owns, so each finding comes from exactly one project.
 */
export type RuleLevel = 'whole' | 'repository' | 'project';

/** A rule and the level it judges at. */
export interface LeveledRule {
  readonly level: RuleLevel;
  readonly rule: Rule;
}

/** The findings `rule` makes of `reading`: each breach under the rule's id and remedy. */
export function applyRule(rule: Rule, reading: RuleReading): Finding[] {
  return rule.judge(reading).map((breach) => ({
    rule: rule.id,
    path: breach.path,
    message: breach.message,
    remedy: breach.remedy ?? rule.remedy,
  }));
}

/** Whether `reach` judges a reference from the file at `from` to the path `to`. */
export function reachesReference(reach: ReferenceReach, from: string, to: string): boolean {
  if (reach.kind === 'all') return true;
  const sameOwner = findOwner(reach.projects, to) === findOwner(reach.projects, from);
  return reach.kind === 'within-project' ? sameOwner : !sameOwner;
}

/** The printed form of a finding: `<rule-id> <path>: <message>; fix: <remedy>`. */
export function formatFinding(finding: Finding): string {
  return `${finding.rule} ${finding.path}: ${finding.message}; fix: ${finding.remedy}`;
}
