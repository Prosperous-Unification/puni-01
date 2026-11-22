import {
  type CheckoutFiles,
  type CheckScope,
  checkoutDefects,
  compareBytes,
  isRepositoryLevel,
  type RepositoryType,
  repositoryScope,
} from '@puni/shared-checkout';
import { findDefect, type Finding } from '@puni/shared-failures';
import type { CheckRequest, CheckRequirements, RepositoryCheck } from './contract';
import {
  applyRule,
  formatFinding,
  type LeveledRule,
  type ReferenceReach,
  type Rule,
} from './finding';
import { ProjectScopeRefused, ScopeOptionsConflict } from './failures';
import { crossProjectRules, ruleSets, stagedRules } from './rule-set.rule';

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

/** The rules a project scope runs: repository- and project-level at the root, else project-level. */
function selectProjectRules(rules: readonly LeveledRule[], scope: CheckScope): readonly Rule[] {
  const levels = isRepositoryLevel(scope) ? ['repository', 'project'] : ['project'];
  return rules.filter(({ level }) => levels.includes(level)).map(({ rule }) => rule);
}

/**
 * The {@link RepositoryCheck}. The repository holding the nearest `puni.json` is found as the
 * type that file declares; `repo` names the type to judge instead, resolved through the registry
 * to the checkout beside it. The judged type selects its rule set from {@link ruleSets}. Without
 * an option the whole repository is judged by every rule. With `project`, only what that project
 * of the `system-state` repository owns, by the rules of its level, references reaching only
 * paths the same project owns. With `crossProjectLinks`, every file, by
 * {@link crossProjectRules}, references reaching only paths another project owns. So every
 * project check, the cross-project check and the `whole`-level rules together find what the
 * whole check finds. With `staged`, the staged files as the index holds them, by
 * {@link stagedRules}. Findings are sorted by their printed form.
 */
export function createRepositoryCheck({
  checkoutRegistry,
  checkoutFiles,
  checkoutProjectScope,
  checkoutWikiIndex,
  recordsCatalog,
  commandCatalog,
}: CheckRequirements): RepositoryCheck {
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
      try {
        const found = checkoutRegistry.locate(cwd);
        const type = request.repo ?? found.type;
        const mode = selectMode(request, type);
        summary = type;
        const { root, registry } = checkoutRegistry.resolve(found, type);
        const files =
          mode.kind === 'staged' ? checkoutFiles.openStaged(root) : checkoutFiles.open(root);
        const { scope, references, rules, label } = plan(mode, ruleSets[type], files);
        summary = `${type}, ${label}${String(rules.length)} ${rules.length === 1 ? 'rule' : 'rules'}`;
        const reading = {
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
        const defect = findDefect(caught, checkoutDefects);
        if (defect === undefined) throw caught;
        findings = [defect];
      }
      const sorted = findings
        .map((finding) => ({ finding, line: formatFinding(finding) }))
        .sort((left, right) => compareBytes(left.line, right.line))
        .map(({ finding }) => finding);
      return { summary, findings: sorted };
    },
  };
}
