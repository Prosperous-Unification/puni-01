import type { FileSystem, Git, GitIndexEntry, PathKind } from '@puni/shared-ports';
import type { IndexDrift, IndexSources } from './index-sources';
import type { CheckScope, Project, ProjectScope } from './ownership';
import type { Repository, RepositoryType } from './registry';

export type { FileSystem, Git, GitIndexEntry, GitListing, PathKind } from '@puni/shared-ports';

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
   * @throws FileUnreadable naming the file when it exists but cannot be read.
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

/** One visible path that exists in the working tree, and what it is. */
export interface CheckoutEntry {
  readonly path: string;
  readonly kind: Exclude<PathKind, 'absent'>;
}

/**
 * One checkout, the single way code sees a repository's files. Paths are repository-relative
 * POSIX paths; one that is absolute or leaves the root is refused with `CheckoutPathRefused`. A
 * visible file is one git shows (tracked, or untracked and not ignored) that is a regular file in
 * the working tree; a path git ignores is invisible to every listing. A checkout asks git once,
 * on its first listing, so it shows the files as they were then; open a new one to see later
 * changes. Every listing is sorted by its paths' bytes, and every listing throws
 * `CheckoutUnlistable` (the `repository.git` defect) when git cannot list the checkout.
 */
export interface CheckoutFiles {
  /** The absolute directory the checkout's paths are relative to. */
  readonly root: string;
  /**
   * The text of the file at `path`.
   *
   * @throws FileUnreadable naming `path` when it cannot be read, with the runtime's error as cause.
   */
  readText(path: string): string;
  /** What `path` is, a final symlink not followed; a path below a file is `absent`. */
  describe(path: string): PathKind;
  /** Whether something exists at `path`, a symlink followed to its target. Never throws. */
  exists(path: string): boolean;
  /**
   * Whether `path` is a file git shows, or a directory holding one. Unlike {@link exists}, a path
   * git ignores (a build output, an editor directory) is not shown, so a judgement over it is the
   * same in every checkout of the same commit.
   */
  isShown(path: string): boolean;
  /** The target text of the symlink at `path`. */
  readLinkTarget(path: string): string;
  /**
   * The abbreviated hash of the commit the checkout's `HEAD` names.
   *
   * @throws HeadCommitUnreadable (the `repository.git` defect) when git gives none, as in a
   *   repository with no commit.
   */
  readHeadCommit(): string;
  /** The visible files `scope` owns. */
  listVisible(scope: CheckScope): readonly string[];
  /** Every path git shows that exists in the working tree, of whatever kind. */
  listVisibleEntries(): readonly CheckoutEntry[];
  /**
   * The entries of the git index that `scope` owns, each by the kind its mode names, whatever the
   * working tree holds there: the one listing that shows a symlink's target as git records it,
   * and a gitlink at all. A staged or commit view lists none, since its visible files already
   * read each symlink as its target text.
   */
  listIndexEntries(scope: CheckScope): readonly GitIndexEntry[];
  /**
   * Writes `text` at `path` in the checkout's write area, creating its directories, replacing a
   * file there. A system-state checkout writes only inside `wiki/index/`; a records checkout only
   * directly inside a kind directory. Any other path is refused with `CheckoutPathRefused`.
   */
  write(path: string, text: string): void;
  /**
   * Publishes a new file in the checkout's write area, creating its directories. Returns
   * `exists` when the destination is already occupied, and refuses a non-directory ancestor
   * (including symlinks) or a path outside the write area with `CheckoutPathRefused`.
   */
  createFile(path: string, text: string): 'created' | 'exists';
  /** Removes the file at `path` in the checkout's write area. */
  remove(path: string): void;
  /**
   * Removes every empty directory below `directory`, which is `wiki/index` or inside it; a
   * records checkout empties none.
   */
  removeEmptyDirectories(directory: string): void;
}

/**
 * Where a new repository is created: in an existing directory holding nothing but `.git`, or at
 * a path where nothing exists yet.
 */
export type NewCheckoutPlace = 'empty-directory' | 'absent';

/**
 * A repository being created: it only adds the entry files a new repository of its type starts
 * with (`seedFiles`), and for a system-state repository the generated index, each once.
 * Paths are repository-relative POSIX paths; any other path, or one where something already
 * exists, is refused with `CheckoutPathRefused`.
 */
export interface NewCheckout {
  /** The absolute directory the repository is created in. */
  readonly root: string;
  /** Writes `text` at `path`, creating its directories. */
  write(path: string, text: string): void;
  /** Creates a symlink at `path` holding the target text `target`. */
  link(path: string, target: string): void;
}

/**
 * One commit of a range seen as checkouts: its full hash, the short hash to print, the view of
 * the lines it adds, and the view of its message alone, so that no path it adds can stand in for
 * the message.
 */
export interface CommitCheckout {
  readonly fullHash: string;
  readonly shortHash: string;
  readonly files: CheckoutFiles;
  readonly message: CheckoutFiles;
}

/** Opens checkouts. */
export interface CheckoutFilesResource {
  /** The checkout of a repository of `type` whose root is the absolute directory `root`. */
  open(root: string, type: RepositoryType): CheckoutFiles;
  /**
   * The staged view of a checkout: its visible files are those the git index adds, copies,
   * modifies or renames, read as the index holds them; describing, existence and the `HEAD`
   * commit still look at the working tree, and every write is refused.
   *
   * @throws StagedTextUnreadable when git cannot give the staged text of a file.
   */
  openStaged(root: string): CheckoutFiles;
  /**
   * The commits `head` reaches and `base` does not, oldest first, each as two views. In `files`
   * the visible files are the paths it adds a line to, each read as those lines at their line
   * numbers with every other line empty; in `message` the one visible file is
   * `commitMessagePath`, read as its message. A merge adds what it holds beyond its first
   * parent. Describing, existence and the `HEAD`
   * commit still look at the working tree, and every write is refused.
   *
   * @throws RevisionUnknown when `base` or `head` names no commit.
   * @throws CommitsUnlistable (the `repository.git` defect) when git cannot list the commits.
   */
  openCommits(root: string, base: string, head: string): readonly CommitCheckout[];
  /**
   * A new repository of `type` at the absolute directory `root`, which must be `place`. It
   * judges `root` when called and writes nothing until asked.
   *
   * @throws CheckoutRootRefused when `root` holds anything but `.git` or is not a directory
   *   (`empty-directory`), or when something exists there (`absent`).
   */
  create(root: string, type: RepositoryType, place: NewCheckoutPlace): NewCheckout;
}

/** The projects of a checkout and the scope a `--project` names. */
export interface ProjectScopeResource {
  /**
   * Every project: each visible `project.json` that parses and names its project, sorted by
   * directory. One that does not is no project; its files belong to the enclosing one.
   *
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
  resolve(files: CheckoutFiles, name: string): ProjectScope;
}

/** The sources of the generated wiki index and the committed index itself. */
export interface WikiIndexResource {
  /**
   * Reads every Nx project (`project.json` under `apps/` and `libs/`) and every authored page
   * (Markdown under `wiki/` outside `wiki/index/`) that is visible and not below `node_modules`;
   * a project's entry carries its scope. In an Nx workspace (one with `nx.json`) a missing
   * `apps/` or `libs/` is a defect. A defect in them is no failure; each one is returned, sorted
   * by path.
   */
  readSources(files: CheckoutFiles): IndexSources;
  /**
   * How the visible files of the committed `wiki/index/` differ from `expected`; a file standing
   * where the `wiki/index` directory belongs is unexpected.
   */
  compare(files: CheckoutFiles, expected: ReadonlyMap<string, string>): IndexDrift;
  /**
   * Makes the visible files of `wiki/index/` exactly `expected`: removes each unexpected one,
   * then writes each missing or stale file, removes every directory left empty, and returns that
   * drift. A file git ignores there is neither compared nor removed.
   */
  write(files: CheckoutFiles, expected: ReadonlyMap<string, string>): IndexDrift;
}

/** What the checkout module exports. */
export interface CheckoutExports {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly checkoutProjectScope: ProjectScopeResource;
  readonly checkoutWikiIndex: WikiIndexResource;
}
