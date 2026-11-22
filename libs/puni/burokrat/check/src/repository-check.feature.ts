import {
  type CheckScope,
  checkoutDefects,
  compareBytes,
  isRepositoryLevel,
  repositoryScope,
} from '@puni/shared-checkout';
import { findDefect, type Finding } from '@puni/shared-failures';
import type { CheckRequirements, RepositoryCheck } from './contract';
import { formatFinding, type LeveledRule } from './finding';
import { ProjectScopeRefused } from './failures';
import { ruleSets } from './rule-set.rule';

/** The rules `scope` runs: every rule for a repository-level scope, else the project-level ones. */
function selectRules(rules: readonly LeveledRule[], scope: CheckScope): readonly LeveledRule[] {
  return isRepositoryLevel(scope) ? rules : rules.filter((rule) => rule.level === 'project');
}

/**
 * The {@link RepositoryCheck}. The repository holding the nearest `puni.json` is found as the
 * type that file declares; `repo` names the type to judge instead, resolved through the registry
 * to the checkout beside it. The judged type selects its rule set from {@link ruleSets}. Without
 * `project` the whole repository is judged; with it, only what that project of the
 * `system-state` repository owns, so that the union of every project's findings is the whole
 * repository's. Findings are sorted by their printed form.
 */
export function createRepositoryCheck({
  checkoutRegistry,
  checkoutFiles,
  checkoutProjectScope,
  checkoutWikiIndex,
  recordsCatalog,
  commandCatalog,
}: CheckRequirements): RepositoryCheck {
  return {
    check(request, cwd) {
      let summary = 'no repository';
      let findings: Finding[];
      try {
        const found = checkoutRegistry.locate(cwd);
        const type = request.repo ?? found.type;
        if (request.project !== undefined && type !== 'system-state') {
          throw new ProjectScopeRefused({ details: { type } });
        }
        summary = type;
        const { root, registry } = checkoutRegistry.resolve(found, type);
        const files = checkoutFiles.open(root);
        const scope =
          request.project === undefined
            ? repositoryScope
            : checkoutProjectScope.resolve(files, request.project);
        const rules = selectRules(ruleSets[type], scope);
        const scopeName = scope.kind === 'repository' ? '' : `project ${scope.project.name}, `;
        summary = `${type}, ${scopeName}${String(rules.length)} rules`;
        const reading = {
          files,
          registry,
          commands: commandCatalog.list(),
          scope,
          wikiIndex: checkoutWikiIndex,
          records: recordsCatalog,
        };
        findings = rules.flatMap((rule) => rule.judge(reading));
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
