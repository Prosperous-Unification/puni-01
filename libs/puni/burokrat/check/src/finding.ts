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

export { type Finding, formatFinding } from '@puni/shared-failures';

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

/**
 * A rule: a stable id, the rules epoch that introduced it, what to do when it breaks, and a
 * judgement that is empty when it holds.
 */
export interface Rule {
  /** A stable `subject.rule` id. */
  readonly id: string;
  /**
   * The rules epoch that introduced the rule: `check` applies it only to a repository whose
   * `puni.json` pins `rules` at this epoch or later. A new rule, or a change that makes an
   * existing rule refuse what it accepted, gets the next epoch: a stricter change ships as a new
   * rule id or a bumped `since`, so no repository's verdict changes until it upgrades.
   */
  readonly since: number;
  /**
   * The later epochs at which the judgement changed without a new id, each judged by what is in
   * force at the repository's pin, as `agents.rules` judges the rules text; they count toward
   * {@link latestEpoch} as `since` does.
   */
  readonly revisions?: readonly number[];
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

/**
 * The latest rules epoch of `rules`: the largest `since` or revision of any of them, 1 when there
 * is none.
 */
export function latestEpoch(rules: Iterable<Rule>): number {
  let latest = 1;
  for (const rule of rules) latest = Math.max(latest, rule.since, ...(rule.revisions ?? []));
  return latest;
}

/** Whether `rule` applies to a repository pinned at the rules epoch `pin`. */
export function appliesAt(rule: Rule, pin: number): boolean {
  return rule.since <= pin;
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
