import type { CommandBrief } from '@puni/shared-command';
import {
  type CheckoutFiles,
  type CheckScope,
  findOwner,
  type Project,
  type ProjectSource,
  type RepositoryRegistry,
  type RepositoryType,
  type SourceRegistry,
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
 * scope of the run, the references it reaches, the project sources the map is read with, the
 * source readers of the run, and the records. A project-level rule judges only what its scope
 * owns.
 */
export interface RuleReading {
  readonly files: CheckoutFiles;
  /** The project's repositories by role, as the system-state `puni.json` registers them. */
  readonly registry: RepositoryRegistry;
  readonly commands: readonly CommandBrief[];
  readonly scope: CheckScope;
  readonly references: ReferenceReach;
  readonly projectSources: readonly ProjectSource[];
  readonly sources: SourceRegistry;
  readonly records: RecordsCatalog;
}

/** One place a rule does not hold; `remedy` replaces the rule's own for this breach alone. */
export interface Breach {
  readonly path: string;
  readonly message: string;
  readonly remedy?: string;
}

/**
 * A rule: a stable id, the rules epochs it applies at, what to do when it breaks, and a
 * judgement that is empty when it holds.
 *
 * The epochs keep one contract: a repository that passes keeps passing until it upgrades its
 * pin. So a rule applies to a repository pinned at `pin` when `since <= pin` and, if it has an
 * `until`, `pin < until`. A new rule takes the next epoch as its `since`. A rule made to refuse
 * what it accepted ships as two objects: the old one given `until: N`, and the new one (the same
 * id is allowed) with `since: N`. A rule object ended by an `until` with no successor is retired
 * and listed in `retiredRules`. Deleting a rule outright is a loosening, which keeps the contract,
 * and is not listed.
 */
export interface Rule {
  /** A stable `subject.rule` id. */
  readonly id: string;
  /** The first rules epoch the rule applies at. */
  readonly since: number;
  /** The first rules epoch the rule no longer applies at; absent while it still applies. */
  readonly until?: number;
  /** What to do about a breach, in the imperative, naming the command when one exists. */
  readonly remedy: string;
  judge(reading: RuleReading): readonly Breach[];
}

/**
 * The level a rule judges at. A `repository` rule runs when the whole repository is judged and
 * for the root project; a `project` rule runs in every scope and judges only what the scope owns,
 * so each finding comes from exactly one project.
 */
export type RuleLevel = 'repository' | 'project';

/** A rule and the level it judges at. */
export interface LeveledRule {
  readonly level: RuleLevel;
  readonly rule: Rule;
}

/**
 * The rules `check` judges by: each repository type's rule set, the rules of the scoped run
 * `--cross-project-links`, each type's secret rules, which `--staged` and `--commits` apply, and
 * the digest of the `AGENTS.md` rules section from
 * each epoch at which it changed, from which the sets' `agents.rules` rules are made.
 */
export interface CheckRules {
  readonly sets: Readonly<Record<RepositoryType, readonly LeveledRule[]>>;
  readonly crossProject: readonly Rule[];
  readonly secrets: Readonly<Record<RepositoryType, readonly Rule[]>>;
  readonly agentsRulesDigests: Readonly<Record<number, string>>;
}

/** Every rule of `rules`: every rule set and the scoped runs. */
export function listEveryRule(rules: CheckRules): Rule[] {
  return [
    ...Object.values(rules.sets).flatMap((set) => set.map(({ rule }) => rule)),
    ...rules.crossProject,
    ...Object.values(rules.secrets).flat(),
  ];
}

/**
 * The latest rules epoch of `rules`: the largest `since` or `until` of any of them, 1 when there
 * is none.
 */
export function latestEpoch(rules: Iterable<Rule>): number {
  let latest = 1;
  for (const rule of rules) latest = Math.max(latest, rule.since, rule.until ?? 1);
  return latest;
}

/** Whether `rule` applies to a repository pinned at the rules epoch `pin`. */
export function appliesAt(rule: Rule, pin: number): boolean {
  return rule.since <= pin && (rule.until === undefined || pin < rule.until);
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
