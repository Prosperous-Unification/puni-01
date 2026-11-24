import {
  type CheckoutFiles,
  type CheckScope,
  compareBytes,
  findCheckoutDefect,
  isRepositoryLevel,
  type LatestRules,
  replaceRulesSection,
  type RepositoryType,
  repositoryScope,
  RulesPinAhead,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import type { CheckRequest, CheckRequirements, NewerRules, RepositoryCheck } from './contract';
import {
  appliesAt,
  applyRule,
  formatFinding,
  latestEpoch,
  type LeveledRule,
  type ReferenceReach,
  type Rule,
  type RuleReading,
} from './finding';
import { ProjectScopeRefused, ScopeOptionsConflict } from './failures';
import { crossProjectRules, type ruleSets, stagedRules } from './rule-set.rule';

/** What one run judges, chosen by the request's options. */
type CheckMode =
  | { readonly kind: 'whole' }
  | { readonly kind: 'project'; readonly name: string }
  | { readonly kind: 'cross-project' }
  | { readonly kind: 'staged' };

/** A run: the scope it lists files in, the references it reaches, its rules and its label. */
interface RunPlan {
  readonly scope: CheckScope;
  readonly references: ReferenceReach;
  readonly rules: readonly Rule[];
  readonly label: string;
}

const needsState = new Set<CheckMode['kind']>(['project', 'cross-project']);

function selectMode(request: CheckRequest, type: RepositoryType): CheckMode {
  const modes: (readonly [string, CheckMode])[] = [];
  if (request.project !== undefined) {
    modes.push(['--project', { kind: 'project', name: request.project }]);
  }
  if (request.crossProjectLinks === true) {
    modes.push(['--cross-project-links', { kind: 'cross-project' }]);
  }
  if (request.staged === true) modes.push(['--staged', { kind: 'staged' }]);
  if (modes.length > 1) {
    throw new ScopeOptionsConflict({ details: { options: modes.map(([option]) => option) } });
  }
  const [chosen] = modes;
  if (chosen === undefined) return { kind: 'whole' };
  const [option, mode] = chosen;
  if (needsState.has(mode.kind) && type !== 'system-state') {
    throw new ProjectScopeRefused({ details: { option, type } });
  }
  return mode;
}

/** Every rule `checkRuleSets` and the scoped runs hold. */
function listEveryRule(checkRuleSets: typeof ruleSets): Rule[] {
  return [
    ...Object.values(checkRuleSets).flatMap((rules) => rules.map(({ rule }) => rule)),
    ...crossProjectRules,
    ...stagedRules,
  ];
}

/** `findings` sorted by their printed form. */
function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .map((finding) => ({ finding, line: formatFinding(finding) }))
    .sort((left, right) => compareBytes(left.line, right.line))
    .map(({ finding }) => finding);
}

/** The ids of `rules` that a repository pinned at `pin` is not yet judged by, sorted, once each. */
function listNewer(rules: readonly Rule[], pin: number): string[] {
  const ids = rules.filter((rule) => !appliesAt(rule, pin)).map(({ id }) => id);
  return [...new Set(ids)].sort(compareBytes);
}

/** The rules a project scope runs: repository- and project-level at the root, else project-level. */
function selectProjectRules(rules: readonly LeveledRule[], scope: CheckScope): readonly Rule[] {
  const levels = isRepositoryLevel(scope) ? ['repository', 'project'] : ['project'];
  return rules.filter(({ level }) => levels.includes(level)).map(({ rule }) => rule);
}

/**
 * The {@link RepositoryCheck}. The repository holding the nearest `puni.json` is found as the
 * type that file declares; `repo` names the type to judge instead, resolved through the registry
 * to the checkout beside it. The judged type selects its rule set from `checkRuleSets`, which the
 * module supplies as {@link ruleSets}. Without an option the whole repository is judged by every
 * rule. With `project`, only what that project of the `system-state` repository owns, by the
 * rules of its level, references reaching only paths the same project owns. With `crossProjectLinks`, every file, by
 * {@link crossProjectRules}, references reaching only paths another project owns. So every
 * project check, the cross-project check and the `whole`-level rules together find what the
 * whole check finds. With `staged`, the staged files as the index holds them, by
 * {@link stagedRules}. Every run applies only the rules its `puni.json` pin reaches, and names
 * the ones it leaves for a later epoch. Findings are sorted by their printed form.
 */
export function createRepositoryCheck({
  checkoutRegistry,
  checkoutFiles,
  checkoutProjectScope,
  checkoutWikiIndex,
  recordsCatalog,
  commandCatalog,
  programSource,
  checkRuleSets,
}: CheckRequirements & { readonly checkRuleSets: typeof ruleSets }): RepositoryCheck {
  const latest = latestEpoch(listEveryRule(checkRuleSets));
  const plan = (mode: CheckMode, rules: readonly LeveledRule[], files: CheckoutFiles): RunPlan => {
    switch (mode.kind) {
      case 'whole':
        return {
          scope: repositoryScope,
          references: { kind: 'all' },
          rules: rules.map(({ rule }) => rule),
          label: '',
        };
      case 'project': {
        const scope = checkoutProjectScope.resolve(files, mode.name);
        return {
          scope,
          references: { kind: 'within-project', projects: scope.projects },
          rules: selectProjectRules(rules, scope),
          label: `project ${scope.project.name}, `,
        };
      }
      case 'cross-project':
        return {
          scope: repositoryScope,
          references: { kind: 'cross-project', projects: checkoutProjectScope.list(files) },
          rules: crossProjectRules,
          label: 'cross-project links, ',
        };
      case 'staged':
        return {
          scope: repositoryScope,
          references: { kind: 'all' },
          rules: stagedRules,
          label: 'staged files, ',
        };
    }
  };
  return {
    check(request, cwd) {
      let summary = 'no repository';
      let findings: Finding[];
      let newer: NewerRules | undefined;
      try {
        const found = checkoutRegistry.locate(cwd);
        const type = request.repo ?? found.type;
        const mode = selectMode(request, type);
        summary = type;
        const { root, registry } = checkoutRegistry.resolve(found, type);
        const pin = registry.rules;
        if (pin > latest) {
          throw new RulesPinAhead({ details: { pin, latest, version: programSource.version } });
        }
        const files =
          mode.kind === 'staged' ? checkoutFiles.openStaged(root) : checkoutFiles.open(root, type);
        const { scope, references, rules: all, label } = plan(mode, checkRuleSets[type], files);
        const rules = all.filter((rule) => appliesAt(rule, pin));
        const ids = listNewer(all, pin);
        if (ids.length > 0) newer = { pin, ids };
        summary = `${type}, ${label}${String(rules.length)} ${rules.length === 1 ? 'rule' : 'rules'}`;
        const reading: RuleReading = {
          files,
          registry,
          commands: commandCatalog.list(),
          scope,
          references,
          wikiIndex: checkoutWikiIndex,
          records: recordsCatalog,
        };
        findings = rules.flatMap((rule) => applyRule(rule, reading));
      } catch (caught) {
        const defect = findCheckoutDefect(caught);
        if (defect === undefined) throw caught;
        findings = [defect];
      }
      return { summary, findings: sortFindings(findings), newer };
    },
  };
}

/**
 * The {@link LatestRules} of `checkRuleSets`, which the module supplies as {@link ruleSets}: its
 * epoch is the latest of every rule there and in the scoped runs, and it judges the whole
 * system-state repository by every rule of that epoch, over a view of the checkout whose
 * `AGENTS.md` rules section, when it has one, is the given text, and a registry pinned there.
 */
export function createLatestRules({
  checkoutRegistry,
  checkoutFiles,
  checkoutWikiIndex,
  recordsCatalog,
  commandCatalog,
  checkRuleSets,
}: CheckRequirements & { readonly checkRuleSets: typeof ruleSets }): LatestRules {
  const epoch = latestEpoch(listEveryRule(checkRuleSets));
  return {
    epoch,
    judge(cwd, rules) {
      let findings: Finding[];
      try {
        const found = checkoutRegistry.locate(cwd);
        const { root, registry } = checkoutRegistry.resolve(found, 'system-state');
        const files = checkoutFiles.open(root, 'system-state');
        const readText = (path: string): string => {
          const text = files.readText(path);
          return path === 'AGENTS.md' ? (replaceRulesSection(text, rules) ?? text) : text;
        };
        const reading: RuleReading = {
          files: { ...files, readText },
          registry: { ...registry, rules: epoch },
          commands: commandCatalog.list(),
          scope: repositoryScope,
          references: { kind: 'all' },
          wikiIndex: checkoutWikiIndex,
          records: recordsCatalog,
        };
        findings = checkRuleSets['system-state']
          .map(({ rule }) => rule)
          .filter((rule) => appliesAt(rule, epoch))
          .flatMap((rule) => applyRule(rule, reading));
      } catch (caught) {
        const defect = findCheckoutDefect(caught);
        if (defect === undefined) throw caught;
        findings = [defect];
      }
      return sortFindings(findings);
    },
  };
}
