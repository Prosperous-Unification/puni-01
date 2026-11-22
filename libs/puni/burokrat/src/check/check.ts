import { constant, message, object, option, optional, string } from '@optique/core';
import { compareBytes, findRepository, RepositoryDefect } from '../repository';
import type { CommandBrief } from '../wiki/wiki-index';
import { formatFinding, type LeveledRule } from './finding';
import { ruleSets } from './rules';
import { type CheckScope, isRepositoryLevel, listProjects, repositoryScope } from './scope';

/**
 * `check [--project NAME]`: judges the whole repository against the rule set of its kind, or,
 * with `--project`, one project of a `code` repository.
 */
export const checkParser = object({
  kind: constant('check'),
  project: optional(
    option('--project', string({ metavar: 'NAME' }), {
      description: message`Judge only what this project owns (code repositories).`,
    }),
  ),
});

/** What `check` needs from the app that composes it. */
export interface CheckContext {
  /** Where the repository search starts. */
  readonly cwd: string;
  /** Every command of the composed CLI, for the generated index. */
  readonly commands: readonly CommandBrief[];
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** A command line that names no project of the repository: refused like a usage error. */
class ProjectRefusal extends Error {
  override readonly name = 'ProjectRefusal';
}

/** The rules `scope` runs: every rule for a repository-level scope, else the project-level ones. */
function selectRules(rules: readonly LeveledRule[], scope: CheckScope): readonly LeveledRule[] {
  return isRepositoryLevel(scope) ? rules : rules.filter((rule) => rule.level === 'project');
}

/**
 * The scope `--project` names in the repository at `root`.
 *
 * @throws ProjectRefusal when no project has that name.
 * @throws RepositoryDefect (`repository.projects`) when the root has no project, which must own
 *   every file no other project owns, or when projects cannot be listed.
 */
function resolveProjectScope(root: string, name: string): CheckScope {
  const projects = listProjects(root);
  if (!projects.some((project) => project.directory === '.')) {
    throw new RepositoryDefect(
      'repository.projects',
      'project.json',
      'is missing: --project needs a root project that owns every file no other project owns',
    );
  }
  const project = projects.find((candidate) => candidate.name === name);
  if (project === undefined) {
    const names = projects.map((candidate) => candidate.name).join(', ');
    throw new ProjectRefusal(`no project named ${name}; the projects are ${names}`);
  }
  return { kind: 'project', project, projects };
}

/**
 * Runs `check` against the repository found from `context.cwd`, applying the rule set its
 * `puni.json` kind selects from {@link ruleSets}. Without `project` it judges the whole
 * repository; with it, only what that project owns, so that the union of every project's
 * findings is the whole repository's.
 *
 * Prints each finding as `<rule-id> <path>: <message>`, sorted, then a summary naming the kind
 * and scope, and returns 1; with no finding it prints one `ok` line and returns 0. A missing or
 * invalid `puni.json` or project list is a finding. A `project` that names no project, or any
 * `project` in a `records` repository, prints one `error: ` line to `stderr` and returns 2: the
 * command line is wrong, so nothing was judged.
 */
export function runCheck(
  request: { readonly project?: string | undefined },
  context: CheckContext,
): 0 | 1 | 2 {
  let lines: string[];
  let summary = 'no repository';
  try {
    const { root, kind, counterpart } = findRepository(context.cwd);
    summary = kind;
    if (request.project !== undefined && kind !== 'code') {
      throw new ProjectRefusal(`--project needs a code repository; this one is ${kind}`);
    }
    const scope =
      request.project === undefined ? repositoryScope : resolveProjectScope(root, request.project);
    const rules = selectRules(ruleSets[kind], scope);
    const scopeName = scope.kind === 'repository' ? '' : `project ${scope.project.name}, `;
    summary = `${kind}, ${scopeName}${String(rules.length)} rules`;
    lines = rules
      .flatMap((rule) => rule.judge({ root, counterpart, commands: context.commands, scope }))
      .map(formatFinding)
      .sort(compareBytes);
  } catch (cause) {
    if (cause instanceof ProjectRefusal) {
      context.stderr(`error: ${cause.message}\n`);
      return 2;
    }
    if (!(cause instanceof RepositoryDefect)) throw cause;
    lines = [formatFinding({ rule: cause.rule, path: cause.path, message: cause.message })];
  }
  if (lines.length === 0) {
    context.stdout(`ok: ${summary}, no findings.\n`);
    return 0;
  }
  const noun = lines.length === 1 ? 'finding' : 'findings';
  context.stdout(`${lines.join('\n')}\nfail: ${summary}, ${String(lines.length)} ${noun}.\n`);
  return 1;
}
