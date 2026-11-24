import {
  type CheckoutFiles,
  type CheckScope,
  compareBytes,
  findCheckoutDefect,
  isRepositoryLevel,
  type LatestRules,
  openSourceRegistry,
  replaceRulesSection,
  type RepositoryRegistry,
  type RepositoryType,
  repositoryScope,
  requirePinReached,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import { digestRulesSection, rulesDigestAt } from './agents-rules';
import type { CheckRequest, CheckRequirements, NewerRules, RepositoryCheck } from './contract';
import {
  appliesAt,
  applyRule,
  type CheckRules,
  formatFinding,
  latestEpoch,
  type LeveledRule,
  listEveryRule,
  type ReferenceReach,
  type Rule,
  type RuleReading,
} from './finding';
import {
  CommitRangeRefused,
  MergedNeedsCommits,
  ProjectScopeRefused,
  ScopeOptionsConflict,
} from './failures';

/** What the check features need: the module's requirements and the rules it judges by. */
type CheckServices = CheckRequirements & { readonly checkRules: CheckRules };

/** What one run judges, chosen by the request's options. */
type CheckMode =
  | { readonly kind: 'whole' }
  | { readonly kind: 'project'; readonly name: string }
  | { readonly kind: 'cross-project' }
  | { readonly kind: 'staged' }
  | {
      readonly kind: 'commits';
      readonly base: string;
      readonly head: string;
      readonly merged: boolean;
    };

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
 * revision name holds; a symmetric `...`, and an end starting `^`, which would negate it, are
 * refused.
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
    head.startsWith('.') ||
    base.startsWith('^') ||
    head.startsWith('^')
  ) {
    throw new CommitRangeRefused({ details: { range } });
  }
  return { base, head };
}

/**
 * `finding`, made in the commit `shortHash`, as the range check prints it: its path prefixed with
 * the commit, its remedy saying that the commit is public and how to take it out: on a branch not
 * yet merged, by rewriting the branch from `base`; in `merged` history, which is never rewritten,
 * by a pull request removing it.
 */
function locateInCommit(
  finding: Finding,
  shortHash: string,
  base: string,
  merged: boolean,
): Finding {
  const removal = merged
    ? `${shortHash} is merged, so it is public and stays in history: rotate any credential it exposed, and open a pull request that removes it`
    : `${shortHash} is pushed, so it is public: rotate any credential it exposed, and before merge rewrite the branch so that no commit holds it (\`git rebase -i ${base}\`, edit ${shortHash}, \`git push --force-with-lease\`)`;
  return {
    ...finding,
    path: `${shortHash}:${finding.path}`,
    remedy: `${finding.remedy}; ${removal}`,
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
    const range = parseCommitRange(request.commits);
    modes.push(['--commits', { kind: 'commits', ...range, merged: request.merged === true }]);
  } else if (request.merged === true) {
    throw new MergedNeedsCommits();
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

/** `findings` sorted by their printed form. */
function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .map((finding) => ({ finding, line: formatFinding(finding) }))
    .sort((left, right) => compareBytes(left.line, right.line))
    .map(({ finding }) => finding);
}

/** The ids of `rules` that start applying after the pin `pin`, sorted, once each. */
function listNewer(rules: readonly Rule[], pin: number): string[] {
  const ids = rules.filter((rule) => rule.since > pin).map(({ id }) => id);
  return [...new Set(ids)].sort(compareBytes);
}

/**
 * The reading of the whole repository `files` holds, registered by `registry`: every file, every
 * reference, the composed CLI's commands, the project sources of the map, a registry of the
 * source readers of its own, so what it reads of a text is read once, and the records.
 */
function readWhole(
  { commandCatalog, projectSources, sourceReaders, recordsCatalog }: CheckServices,
  files: CheckoutFiles,
  registry: RepositoryRegistry,
): RuleReading {
  return {
    files,
    registry,
    commands: commandCatalog.list(),
    scope: repositoryScope,
    references: { kind: 'all' },
    projectSources,
    sources: openSourceRegistry(sourceReaders),
    records: recordsCatalog,
  };
}

/** The findings of `run`, or the one finding of the checkout defect it throws. */
function judgeOrDefect(run: () => Finding[]): Finding[] {
  try {
    return run();
  } catch (caught) {
    const defect = findCheckoutDefect(caught);
    if (defect === undefined) throw caught;
    return [defect];
  }
}

/** The rules a project scope runs: repository- and project-level at the root, else project-level. */
function selectProjectRules(rules: readonly LeveledRule[], scope: CheckScope): readonly Rule[] {
  const levels = isRepositoryLevel(scope) ? ['repository', 'project'] : ['project'];
  return rules.filter(({ level }) => levels.includes(level)).map(({ rule }) => rule);
}

/**
 * The {@link RepositoryCheck}. The repository holding the nearest `puni.json` is found as the
 * type that file declares; `repo` names the type to judge instead, resolved through the registry
 * to the checkout beside it. The judged type selects its rule set from `checkRules`, which the
 * module supplies from the rule set. Without an option the whole repository is judged by every
 * rule. With `project`, only what that project of the `system-state` repository owns, by the
 * rules of its level, references reaching only paths the same project owns. With
 * `crossProjectLinks`, every file, by its cross-project rules, references reaching only paths
 * another project owns. So every project check and the cross-project check together find what
 * the whole check finds. With `staged`, the staged files as the index holds them, by the secret
 * rules of the type. With `commits`, what each commit of the range adds and its message, judged
 * apart, by the same rules, each finding's path `<commit>:<path>` and its remedy saying how to
 * take the commit out: by rewriting the branch, or, with `merged`, by a pull request. Every run
 * applies only the rules that apply at its `puni.json` pin, by
 * {@link appliesAt}, and names those that start after it. Findings are sorted by their printed
 * form.
 */
export function createRepositoryCheck(services: CheckServices): RepositoryCheck {
  const { checkoutRegistry, checkoutFiles, checkoutProjectScope, programSource, checkRules } =
    services;
  const latest = latestEpoch(listEveryRule(checkRules));
  const plan = (
    mode: Exclude<CheckMode, { kind: 'commits' }>,
    type: RepositoryType,
    files: CheckoutFiles,
  ): RunPlan => {
    const rules = checkRules.sets[type];
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
          rules: checkRules.crossProject,
          label: 'cross-project links, ',
        };
      case 'staged':
        return {
          scope: repositoryScope,
          references: { kind: 'all' },
          rules: checkRules.secrets[type],
          label: 'staged files, ',
        };
    }
  };
  return {
    check(request, cwd) {
      let summary = 'no repository';
      let newer: NewerRules | undefined;
      const findings = judgeOrDefect(() => {
        const found = checkoutRegistry.locate(cwd);
        const type = request.repo ?? found.type;
        const mode = selectMode(request, type);
        summary = type;
        const { root, registry } = checkoutRegistry.resolve(found, type);
        requirePinReached(registry, latest, programSource.version);
        const pin = registry.rules;
        const pinned = (all: readonly Rule[]): readonly Rule[] => {
          const ids = listNewer(all, pin);
          if (ids.length > 0) newer = { pin, ids };
          return all.filter((rule) => appliesAt(rule, pin));
        };
        if (mode.kind === 'commits') {
          const rules = pinned(checkRules.secrets[type]);
          const commits = checkoutFiles.openCommits(root, mode.base, mode.head);
          const count = `${String(commits.length)} ${commits.length === 1 ? 'commit' : 'commits'}`;
          summary = `${type}, commits ${mode.base}..${mode.head}, ${count}, ${countRules(rules)}`;
          return commits.flatMap(({ shortHash, files, message }) =>
            [files, message]
              .flatMap((view) => {
                const reading = readWhole(services, view, registry);
                return rules.flatMap((rule) => applyRule(rule, reading));
              })
              .map((finding) => locateInCommit(finding, shortHash, mode.base, mode.merged)),
          );
        }
        const files =
          mode.kind === 'staged' ? checkoutFiles.openStaged(root) : checkoutFiles.open(root, type);
        const { scope, references, rules: all, label } = plan(mode, type, files);
        const rules = pinned(all);
        summary = `${type}, ${label}${countRules(rules)}`;
        const reading: RuleReading = { ...readWhole(services, files, registry), scope, references };
        return rules.flatMap((rule) => applyRule(rule, reading));
      });
      return { summary, findings: sortFindings(findings), newer };
    },
  };
}

/**
 * The {@link LatestRules} of `checkRules`, which the module supplies as the `checkRules` of the rule set: its
 * epoch is the latest of every rule there. It judges each whole repository of the project by
 * the rules of its type that apply at that epoch, with the registry pinned there and, for the
 * system-state repository, a view of the checkout whose `AGENTS.md` rules section, when it has
 * one, is the given text. Whether a section holds an epoch's rules is judged by the digest
 * in force at that epoch.
 */
export function createLatestRules(services: CheckServices): LatestRules {
  const { checkoutRegistry, checkoutFiles, checkRules } = services;
  const epoch = latestEpoch(listEveryRule(checkRules));
  const judgeType = (cwd: string, type: RepositoryType, rules: string): Finding[] =>
    judgeOrDefect(() => {
      const found = checkoutRegistry.locate(cwd);
      const { root, registry } = checkoutRegistry.resolve(found, type);
      const files = checkoutFiles.open(root, type);
      const readText = (path: string): string => {
        const text = files.readText(path);
        if (type !== 'system-state' || path !== 'AGENTS.md') return text;
        return replaceRulesSection(text, rules) ?? text;
      };
      const reading = readWhole(services, { ...files, readText }, { ...registry, rules: epoch });
      return checkRules.sets[type]
        .map(({ rule }) => rule)
        .filter((rule) => appliesAt(rule, epoch))
        .flatMap((rule) => applyRule(rule, reading));
    });
  return {
    epoch,
    judge(cwd, rules) {
      return {
        'system-state': sortFindings(judgeType(cwd, 'system-state', rules)),
        'system-records': sortFindings(judgeType(cwd, 'system-records', rules)),
      };
    },
    holdsRulesOf(section, at) {
      return digestRulesSection(section) === rulesDigestAt(checkRules.agentsRulesDigests, at);
    },
  };
}
