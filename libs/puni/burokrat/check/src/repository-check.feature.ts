import {
  type CheckoutFiles,
  type CheckScope,
  compareBytes,
  findCheckoutDefect,
  isRepositoryLevel,
  type RepositoryType,
  repositoryScope,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import type { CheckRequest, CheckRequirements, RepositoryCheck } from './contract';
import {
  applyRule,
  formatFinding,
  type LeveledRule,
  type ReferenceReach,
  type Rule,
} from './finding';
import { CommitRangeRefused, ProjectScopeRefused, ScopeOptionsConflict } from './failures';
import { crossProjectRules, type ruleSets, secretRules } from './rule-set.rule';

/** What one run judges, chosen by the request's options. */
type CheckMode =
  | { readonly kind: 'whole' }
  | { readonly kind: 'project'; readonly name: string }
  | { readonly kind: 'cross-project' }
  | { readonly kind: 'staged' }
  | { readonly kind: 'commits'; readonly base: string; readonly head: string };

/** A run: the scope it lists files in, the references it reaches, its rules and its label. */
interface RunPlan {
  readonly scope: CheckScope;
  readonly references: ReferenceReach;
  readonly rules: readonly Rule[];
  readonly label: string;
}

const needsState = new Set<CheckMode['kind']>(['project', 'cross-project']);

/**
 * The ends of `range`, `<base>..<head>`: two non-empty revisions around one `..`, which no
 * revision name holds; a symmetric `...` is refused.
 *
 * @throws CommitRangeRefused when `range` is not that.
 */
function parseCommitRange(range: string): { readonly base: string; readonly head: string } {
  const [base, head, ...rest] = range.split('..');
  if (
    base === undefined ||
    head === undefined ||
    rest.length > 0 ||
    base === '' ||
    head === '' ||
    head.startsWith('.')
  ) {
    throw new CommitRangeRefused({ details: { range } });
  }
  return { base, head };
}

/**
 * `finding`, made in what `commit` adds, as the range check prints it: its path prefixed with the
 * commit, its remedy saying that the commit is public and how to take it out of the branch.
 */
function locateInCommit(finding: Finding, commit: string, base: string): Finding {
  return {
    ...finding,
    path: `${commit}:${finding.path}`,
    remedy: `${finding.remedy}; ${commit} is pushed, so it is public: rotate any credential it exposed, and before merge rewrite the branch so that no commit holds it (\`git rebase -i ${base}\`, edit ${commit}, \`git push --force-with-lease\`)`,
  };
}
function selectMode(request: CheckRequest, type: RepositoryType): CheckMode {
  const modes: (readonly [string, CheckMode])[] = [];
  if (request.project !== undefined) {
    modes.push(['--project', { kind: 'project', name: request.project }]);
  }
  if (request.crossProjectLinks === true) {
    modes.push(['--cross-project-links', { kind: 'cross-project' }]);
  }
  if (request.staged === true) modes.push(['--staged', { kind: 'staged' }]);
  if (request.commits !== undefined) {
    modes.push(['--commits', { kind: 'commits', ...parseCommitRange(request.commits) }]);
  }
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

/** `<n> rule` or `<n> rules`. */
function countRules(rules: readonly Rule[]): string {
  return `${String(rules.length)} ${rules.length === 1 ? 'rule' : 'rules'}`;
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
 * whole check finds. With `staged`, the staged files as the index holds them, by the
 * {@link secretRules} of the type. With `commits`, what each commit of the range adds and its
 * message, by the same rules, each finding's path `<commit>:<path>` and its remedy saying how to
 * take the commit out of the branch. Findings are sorted by their printed form.
 */
export function createRepositoryCheck({
  checkoutRegistry,
  checkoutFiles,
  checkoutProjectScope,
  checkoutWikiIndex,
  recordsCatalog,
  commandCatalog,
  checkRuleSets,
}: CheckRequirements & { readonly checkRuleSets: typeof ruleSets }): RepositoryCheck {
  const plan = (
    mode: Exclude<CheckMode, { kind: 'commits' }>,
    type: RepositoryType,
    files: CheckoutFiles,
  ): RunPlan => {
    const rules = checkRuleSets[type];
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
          rules: secretRules[type],
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
        const reading = {
          registry,
          commands: commandCatalog.list(),
          references: { kind: 'all' } as const,
          scope: repositoryScope,
          wikiIndex: checkoutWikiIndex,
          records: recordsCatalog,
        };
        if (mode.kind === 'commits') {
          const rules = secretRules[type];
          const commits = checkoutFiles.openCommits(root, mode.base, mode.head);
          const count = `${String(commits.length)} ${commits.length === 1 ? 'commit' : 'commits'}`;
          summary = `${type}, commits ${mode.base}..${mode.head}, ${count}, ${countRules(rules)}`;
          findings = commits.flatMap(({ commit, files }) =>
            rules
              .flatMap((rule) => applyRule(rule, { ...reading, files }))
              .map((finding) => locateInCommit(finding, commit, mode.base)),
          );
        } else {
          const files =
            mode.kind === 'staged'
              ? checkoutFiles.openStaged(root)
              : checkoutFiles.open(root, type);
          const { scope, references, rules, label } = plan(mode, type, files);
          summary = `${type}, ${label}${countRules(rules)}`;
          findings = rules.flatMap((rule) =>
            applyRule(rule, { ...reading, files, scope, references }),
          );
        }
      } catch (caught) {
        const defect = findCheckoutDefect(caught);
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
