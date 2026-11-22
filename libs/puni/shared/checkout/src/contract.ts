import type { FileSystem, Git, PathKind } from '@puni/shared-ports';
import type { IndexDrift, IndexSources, SourceDefect } from './index-sources';
import type { CheckScope, Project } from './ownership';
import type { Repository, RepositoryType } from './registry';

export type { FileSystem, Git, PathKind };

/** What the checkout module needs from its host. */
export interface CheckoutRequirements {
  readonly fileSystem: FileSystem;
  readonly git: Git;
}

/** The repository registry: finding the repository a command stands in, and its peers. */
export interface RepositoryRegistryResource {
  /**
   * The repository holding the nearest `puni.json` at or above `cwd`, of the type that file
   * declares for it.
   *
   * @throws RegistryMissing when no such file exists up to the file system root.
   * @throws RegistryInvalid when the file is not a valid registry.
   */
  locate(cwd: string): Repository;
  /**
   * The repository of `type` in the registry `found` was read from: `found` itself for its own
   * type, else the directory beside it named after that repository's remote URL.
   *
   * @throws CheckoutMissing naming the expected path when it is not a directory.
   */
  resolve(found: Repository, type: RepositoryType): Repository;
}

/** Visible regular files, as repository paths sorted by their bytes, or why git listed none. */
export type CheckoutListing = { readonly files: readonly string[] } | { readonly failure: string };

/** One visible path that exists in the working tree, and what it is. */
export interface CheckoutEntry {
  readonly path: string;
  readonly kind: Exclude<PathKind, 'absent'>;
}

/** Every visible path that exists in the working tree, sorted, or why git listed none. */
export type CheckoutEntries =
  { readonly entries: readonly CheckoutEntry[] } | { readonly failure: string };

/**
 * One checkout, the single way code sees a repository's files. Paths are repository-relative
 * POSIX paths; one that is absolute or leaves the root is refused with `CheckoutPathRefused`. A
 * visible file is one git shows (tracked, or untracked and not ignored) that is a regular file in
 * the working tree. A checkout asks git once, on its first listing, so it shows the files as
 * they were then; open a new one to see later changes.
 */
export interface CheckoutFiles {
  /** The text of the file at `path`. */
  readText(path: string): string;
  /** What `path` is, a final symlink not followed. */
  describe(path: string): PathKind;
  /** Whether something exists at `path`, a symlink followed to its target. */
  exists(path: string): boolean;
  /** The target text of the symlink at `path`. */
  readLinkTarget(path: string): string;
  /** The visible files `scope` owns. */
  listVisible(scope: CheckScope): CheckoutListing;
  /** Every path git shows that exists in the working tree, of whatever kind. */
  listVisibleEntries(): CheckoutEntries;
  /** Writes `text` at `path` inside `wiki/index/`, creating its directories. */
  write(path: string, text: string): void;
  /** Removes the file at `path` inside `wiki/index/`. */
  remove(path: string): void;
  /** Removes every empty directory below `directory`, which is `wiki/index` or inside it. */
  removeEmptyDirectories(directory: string): void;
}

/** Opens checkouts. */
export interface CheckoutFilesResource {
  /** The checkout whose root is the absolute directory `root`. */
  open(root: string): CheckoutFiles;
}

/** The projects of a checkout and the scope a `--project` names. */
export interface ProjectScopeResource {
  /**
   * Every project: each visible `project.json` that parses and names its project, sorted by
   * directory. One that does not is no project; its files belong to the enclosing one.
   *
   * @throws ProjectsUnlistable when git fails.
   * @throws ProjectNameShared when two projects share a name.
   */
  list(files: CheckoutFiles): Project[];
  /**
   * The scope of the project named `name`.
   *
   * @throws RootProjectMissing when the root has no project, which must own every file no other
   *   project owns.
   * @throws ProjectUnknown when no project has that name.
   */
  resolve(files: CheckoutFiles, name: string): CheckScope;
}

/** The sources of the generated wiki index and the committed index itself. */
export interface WikiIndexResource {
  /**
   * Reads every Nx project (`project.json` under `apps/` and `libs/`) and every authored page
   * (Markdown under `wiki/` outside `wiki/index/`) that is visible and not below `node_modules`.
   * Never throws for a defect in them; each one is returned, sorted by path.
   */
  readSources(files: CheckoutFiles): IndexSources;
  /**
   * The index-source defects `scope` judges. The whole repository and the root project read every
   * source and keep those the scope owns; another project reads only the `project.json` files it
   * owns, and only when it is indexed (under `apps/` or `libs/`).
   */
  readScopeDefects(files: CheckoutFiles, scope: CheckScope): readonly SourceDefect[];
  /** How the committed `wiki/index/` differs from `expected`. */
  compare(files: CheckoutFiles, expected: ReadonlyMap<string, string>): IndexDrift;
  /**
   * Makes `wiki/index/` exactly `expected`: writes each missing or stale file of `drift`, removes
   * each unexpected one and every directory left empty.
   */
  write(files: CheckoutFiles, expected: ReadonlyMap<string, string>, drift: IndexDrift): void;
}

/** What the checkout module exports. */
export interface CheckoutExports {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly checkoutProjectScope: ProjectScopeResource;
  readonly checkoutWikiIndex: WikiIndexResource;
}
