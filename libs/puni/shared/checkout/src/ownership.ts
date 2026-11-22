/** A project: a directory holding a `project.json` that names it. The root project's is `.`. */
export interface Project {
  readonly name: string;
  readonly directory: string;
}

/**
 * What one run judges: the whole repository, or the files one project owns. A file belongs to the
 * nearest enclosing project directory; `projects` is every project, so ownership can be decided
 * for any path.
 */
export type CheckScope =
  | { readonly kind: 'repository' }
  | { readonly kind: 'project'; readonly project: Project; readonly projects: readonly Project[] };

/** The scope of one project. */
export type ProjectScope = Extract<CheckScope, { readonly kind: 'project' }>;

/** The whole-repository scope. */
export const repositoryScope: CheckScope = { kind: 'repository' };

function contains(directory: string, path: string): boolean {
  return directory === '.' || path === directory || path.startsWith(`${directory}/`);
}

/** The directory of the project owning `path`: the deepest project directory containing it. */
export function findOwner(projects: readonly Project[], path: string): string | undefined {
  let owner: string | undefined;
  for (const { directory } of projects) {
    if (!contains(directory, path)) continue;
    if (owner === undefined || owner === '.' || directory.length > owner.length) owner = directory;
  }
  return owner;
}

/** Whether `scope` judges `path`: always for the whole repository, else when its project owns it. */
export function ownsPath(scope: CheckScope, path: string): boolean {
  return scope.kind === 'repository' || findOwner(scope.projects, path) === scope.project.directory;
}

/** Whether `scope` runs repository-level rules: the whole repository or the root project. */
export function isRepositoryLevel(scope: CheckScope): boolean {
  return scope.kind === 'repository' || scope.project.directory === '.';
}
