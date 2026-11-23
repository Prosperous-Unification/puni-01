import { posix } from 'node:path';
import type { Git, GitWorktree, ProcessRunner } from '@puni/shared-ports';
import type { ResourceWorktree, ResourceWorktreesResource } from './contract';
import {
  ResourceExists,
  ResourceGitFailed,
  ResourceNameRefused,
  ResourceNotDisposable,
  ResourceUnknown,
} from './failures';

/** What the worktrees resource needs from its host. */
export interface ResourceWorktreesRequirements {
  readonly git: Git;
  readonly processRunner: ProcessRunner;
}

/** The directory of the main worktree that holds every resource. */
export const resourcesDirectory = '.worktrees';

/** The ref path every resource branch is under. */
export const resourceBranchPrefix = 'resources';

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The value of a git outcome, or {@link ResourceGitFailed} saying what it was `doing`. */
function orThrow<Value>(outcome: Value | { readonly failure: string }, doing: string): Value {
  if (typeof outcome === 'object' && outcome !== null && 'failure' in outcome) {
    throw new ResourceGitFailed({ details: { doing, reason: outcome.failure } });
  }
  return outcome;
}

/**
 * The {@link ResourceWorktreesResource}: git through `git`, run in the main worktree, so `HEAD`
 * is always the main worktree's; the command run in a resource through `processRunner`, never
 * through a shell.
 */
export function createResourceWorktrees({
  git,
  processRunner,
}: ResourceWorktreesRequirements): ResourceWorktreesResource {
  const listWorktrees = (root: string): readonly GitWorktree[] =>
    orThrow(git.listWorktrees(root), `list the worktrees of ${root}`).worktrees;
  const pathOf = (main: string, name: string): string => posix.join(main, resourcesDirectory, name);
  const branchOf = (name: string): string => `${resourceBranchPrefix}/${name}`;
  const list = (main: string): readonly ResourceWorktree[] =>
    listWorktrees(main)
      .flatMap(({ path, branch }) => {
        const name = posix.basename(path);
        if (path !== pathOf(main, name) || branch !== branchOf(name)) return [];
        const changed = orThrow(git.listChangedFiles(path), `read the status of ${path}`).files;
        return [{ name, branch, path, clean: changed.length === 0 }];
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  const find = (main: string, name: string): ResourceWorktree => {
    const resources = list(main);
    const found = resources.find((resource) => resource.name === name);
    if (found !== undefined) return found;
    throw new ResourceUnknown({
      details: { name, known: resources.map((resource) => resource.name) },
    });
  };
  return {
    findMain(root) {
      const [main] = listWorktrees(root);
      if (main === undefined) {
        throw new ResourceGitFailed({
          details: { doing: `find the main worktree of ${root}`, reason: 'git listed none' },
        });
      }
      return main.path;
    },
    list,
    find,
    create(main, name, from) {
      if (!namePattern.test(name)) throw new ResourceNameRefused({ details: { name } });
      const path = pathOf(main, name);
      const branch = branchOf(name);
      if (listWorktrees(main).some((worktree) => worktree.path === path)) {
        throw new ResourceExists({ details: { name, taken: `a worktree stands at ${path}` } });
      }
      const branches = orThrow(
        git.listBranches(main, resourceBranchPrefix, 'all'),
        `list the branches of ${main}`,
      ).branches;
      if (branches.includes(branch)) {
        throw new ResourceExists({ details: { name, taken: `the branch ${branch} exists` } });
      }
      orThrow(git.addWorktree(main, path, branch, from), `add ${path} from ${from}`);
      return { name, branch, path, clean: true };
    },
    remove(main, name, force) {
      const resource = find(main, name);
      if (!force) {
        const unmerged = orThrow(
          git.listBranches(main, resourceBranchPrefix, 'unmerged'),
          `list the unmerged branches of ${main}`,
        ).branches;
        const reasons = [
          ...(resource.clean ? [] : [`${resource.path} has uncommitted changes`]),
          ...(unmerged.includes(resource.branch)
            ? [`the branch ${resource.branch} holds commits HEAD of ${main} lacks`]
            : []),
        ];
        if (reasons.length > 0) throw new ResourceNotDisposable({ details: { name, reasons } });
      }
      orThrow(git.removeWorktree(main, resource.path, force), `remove ${resource.path}`);
      orThrow(git.deleteBranch(main, resource.branch, force), `delete ${resource.branch}`);
      return resource;
    },
    run: (path, command) => processRunner.runAttached(command, { cwd: path }),
  };
}
