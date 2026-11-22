import { lstatSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { compareBytes, RepositoryDefect } from '../repository';
import { type GitListing, listGitFiles } from './git-files';

/** A project: a directory holding a `project.json` that names it. The root project's is `.`. */
export interface Project {
  readonly name: string;
  readonly directory: string;
}

/**
 * What one `check` run judges: the whole repository, or the files one project owns. A file
 * belongs to the nearest enclosing project directory; `projects` is every project, so ownership
 * can be decided for any path.
 */
export type CheckScope =
  | { readonly kind: 'repository' }
  | { readonly kind: 'project'; readonly project: Project; readonly projects: readonly Project[] };

/** The whole-repository scope. */
export const repositoryScope: CheckScope = { kind: 'repository' };

/** Git options listing tracked files and untracked files git does not ignore. */
export const visibleFiles = ['--cached', '--others', '--exclude-standard'] as const;

function readProjectName(root: string, path: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) return undefined;
  return typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : undefined;
}

/**
 * Every project: each `project.json` git shows (tracked or untracked, not ignored) that is a
 * regular file on disk, parses and names its project. One that does not is no project; its files belong to the enclosing one,
 * and `index.read-when` reports it there.
 *
 * @throws RepositoryDefect (`repository.projects`) when git fails or two projects share a name.
 */
export function listProjects(root: string): Project[] {
  const listing = listGitFiles(root, [...visibleFiles, '--', ':(glob)**/project.json']);
  if ('failure' in listing) throw new RepositoryDefect('repository.projects', '.', listing.failure);
  const projects = listing.files.flatMap((path) => {
    if (!isRegularFile(root, path)) return [];
    const name = readProjectName(root, path);
    return name === undefined ? [] : [{ name, directory: posix.dirname(path) }];
  });
  for (const [index, project] of projects.entries()) {
    const twin = projects.findIndex((other) => other.name === project.name);
    if (twin !== index) {
      const message = `project ${project.name} is named by both ${projects[twin]?.directory ?? ''}/project.json and ${project.directory}/project.json`;
      throw new RepositoryDefect(
        'repository.projects',
        `${project.directory}/project.json`,
        message,
      );
    }
  }
  return projects.sort((left, right) => compareBytes(left.directory, right.directory));
}

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

/**
 * `git ls-files` with `options`, restricted to the files `scope` owns: its project directory
 * less every project nested inside it, as git pathspecs (which match whole path segments).
 */
export function listScopeFiles(
  root: string,
  scope: CheckScope,
  options: readonly string[],
): GitListing {
  if (scope.kind === 'repository') return listGitFiles(root, options);
  const { directory } = scope.project;
  const nested = scope.projects
    .map((project) => project.directory)
    .filter((other) => other !== directory && other !== '.' && contains(directory, other));
  return listGitFiles(root, [
    ...options,
    '--',
    directory,
    ...nested.map((other) => `:(exclude)${other}`),
  ]);
}

/** Whether `scope` runs repository-level rules: the whole repository or the root project. */
export function isRepositoryLevel(scope: CheckScope): boolean {
  return scope.kind === 'repository' || scope.project.directory === '.';
}

/**
 * The Markdown files `scope` owns that git shows (tracked, or untracked and not ignored) and
 * that are regular files on disk: symlinks such as `CLAUDE.md` and deleted files are left out.
 */
export function listScopeMarkdown(root: string, scope: CheckScope): GitListing {
  const listing = listScopeFiles(root, scope, visibleFiles);
  if ('failure' in listing) return listing;
  return {
    files: listing.files.filter((path) => path.endsWith('.md') && isRegularFile(root, path)),
  };
}

/** Whether `path` under `root` is a regular file; a missing path is not. */
export function isRegularFile(root: string, path: string): boolean {
  try {
    return lstatSync(join(root, path)).isFile();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}
