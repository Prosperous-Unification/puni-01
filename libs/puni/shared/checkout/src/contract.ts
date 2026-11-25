import type { FileSystem, Git, GitIndexEntry, PathKind } from '@puni/shared-ports';
import type { ProjectReading } from './map-sources';
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
   * Whether `path` is a file git shows, or a directory holding one. Unlike {@link CheckoutFiles.exists}, a path
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
   * Writes `text` at `path`, creating its directories, replacing a file there. A system-state
   * checkout writes only `puni.json`, `AGENTS.md` and `README.md`; a records checkout only its
   * `AGENTS.md` and directly inside a kind directory. Any other path is refused with
   * `CheckoutPathRefused`.
   */
  write(path: string, text: string): void;
  /**
   * Publishes a new file in the checkout's write area, creating its directories. Returns
   * `exists` when the destination is already occupied, and refuses a non-directory ancestor
   * (including symlinks) or a path outside the write area with `CheckoutPathRefused`.
   */
  createFile(path: string, text: string): 'created' | 'exists';
}

/**
 * Where a new repository is created: in an existing directory holding nothing but `.git`, or at
 * a path where nothing exists yet.
 */
export type NewCheckoutPlace = 'empty-directory' | 'absent';

/**
 * A repository being created: it only adds the entry files a new repository of its type starts
 * with (`seedFiles`), each once.
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

/**
 * A plugin that finds a repository's projects for the map, one per build tool: it reads the
 * projects its tool declares in `files`, each with its place in the map, and reports every
 * defect of their declarations, each with its remedy, instead of failing on it. The host
 * composes the sources a repository is read with as the `projectSources` list.
 */
export interface ProjectSource {
  /**
   * The projects of `files` as a repository pinned at the rules epoch `epoch` declares them: a
   * setting a later epoch introduced is ignored below it, as the puni of that epoch ignored it.
   */
  readProjects(files: CheckoutFiles, epoch: number): ProjectReading;
  /**
   * How a project of this source is given a deeper partition, as a remedy names it: the setting
   * that places it, in words a reader of the source's files knows.
   */
  readonly placementHint: string;
}

/** A half-open range `[start, end)` of character offsets into a source text. */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

/**
 * A symbol a source file declares, by the name a typed reference gives it: a top-level name, or
 * a member of an exported type, object or namespace as `<Name>.<member>`.
 */
export interface SourceDeclaration {
  readonly name: string;
  /** Whether the file exports it, under this name or another, so other files may name it. */
  readonly exported: boolean;
  /** Whether the file only passes it on from another module, as a re-export does. */
  readonly reexported: boolean;
  /** Where the declaration stands in the text, its doc comment excluded. */
  readonly range: SourceRange;
}

/**
 * One doc comment of a source file: its text without the comment markers, and the line its
 * first line of text stands on, so line `n` of the text stands on line `line + n`.
 */
export interface DocComment {
  /** The 1-based line of the first line of `text`. */
  readonly line: number;
  readonly text: string;
}

/**
 * One inline link of a doc comment, in the language's own link syntax: its target as written,
 * the line it stands on, the name it starts with, and whether the file resolves it where the
 * comment stands, by the scopes holding the comment and the file's top level and imports. A link
 * in code inside the comment is no link.
 */
export interface DocLink {
  readonly target: string;
  /** The 1-based line of the link. */
  readonly line: number;
  /** The name the target starts with, which a global may declare when the file does not. */
  readonly head: string;
  /** Whether the file resolves the target where the comment stands; when not, only a global can. */
  readonly resolved: boolean;
  /**
   * Whether the file declares the target's first name but not a member after it: another file
   * augmenting that name (see `SourceReading.augmented`) may declare the member.
   */
  readonly memberMissing: boolean;
}

/** Everything a source reader reads in one text, read in one pass. */
export interface SourceReading {
  /**
   * The symbols the text declares: its top-level declarations, every name it exports, named
   * re-exports included, and the members of what it exports as `<Name>.<member>`.
   */
  readonly declarations: readonly SourceDeclaration[];
  /**
   * The modules the text re-exports whole, as it names them, relative to its own file: their
   * names are its declarations too, which one text cannot list.
   */
  readonly reexports: readonly string[];
  /** The doc comments of the text, in order. */
  readonly docComments: readonly DocComment[];
  /** The inline links of its doc comments, in order (see {@link DocLink}). */
  readonly links: readonly DocLink[];
  /** The names the text declares for every file: those of a script, or of a global block. */
  readonly ambient: readonly string[];
  /**
   * The names the text, a module, adds members to in another module of the repository, by a
   * `declare module './other' { … }` naming it relative to the text's file (see
   * {@link Augmentation}).
   */
  readonly augmented: readonly Augmentation[];
}

/** One name a module augments: the module as the augmentation names it, and the name. */
export interface Augmentation {
  /** The relative specifier the `declare module` names, as written. */
  readonly module: string;
  readonly name: string;
}

/**
 * A plugin that reads the source files of one language: what a file declares, its doc comments
 * and their links, from the file's text alone, in one pass. The host composes the readers a
 * repository is read with as the `sourceReaders` list, and a {@link SourceRegistry} picks one by
 * a file's extension.
 */
export interface SourceReader {
  /** The file extensions this reader reads, each lower-case with its dot, as `.md` is written. */
  readonly extensions: readonly string[];
  /**
   * The rules epoch from which a rule may read this reader's files: a reader added later
   * changes no verdict of a repository pinned before it.
   */
  readonly since: number;
  /**
   * Everything the reader reads in `text`.
   *
   * @throws SourceUnreadable when the text itself cannot be read, as one its parser gives up on.
   * @throws SourceReaderBroken when the reader cannot load what it reads with, as its compiler:
   *   a defect of puni's installation, never of the file.
   * @throws SourceReaderFailed when the reader fails otherwise while reading the text: a defect
   *   of the reader, never of the file.
   */
  read(text: string): SourceReading;
  /**
   * The names the language's libraries declare for every file of the repository at the absolute
   * directory `root`: those puni installs, and those the repository installs and configures,
   * with the packages it lists that are not installed (see {@link InstalledGlobals}).
   *
   * @throws SourceReaderBroken when the libraries puni installs cannot be read.
   */
  globals(root: string): InstalledGlobals;
}

/** The global names a repository's files may use, and the type packages it lists but lacks. */
export interface InstalledGlobals {
  readonly names: ReadonlySet<string>;
  readonly missing: readonly MissingTypes[];
}

/** One type package a repository's configuration lists that its `node_modules` does not hold. */
export interface MissingTypes {
  readonly name: string;
  /** The repository-relative configuration file that lists it. */
  readonly listedIn: string;
}

/**
 * The source readers of one run by extension, each text read once however often a rule asks
 * for it.
 */
export interface SourceRegistry {
  /** The extensions some reader reads from the rules epoch `epoch`, sorted. */
  extensions(epoch: number): readonly string[];
  /**
   * The reader of the file at `path`, by its extension in any case, that a rule may read from
   * the rules epoch `epoch` (see {@link SourceReader.since}); `undefined` when there is none.
   */
  readerOf(path: string, epoch: number): SourceReader | undefined;
}

/** What the checkout module exports. */
export interface CheckoutExports {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly checkoutProjectScope: ProjectScopeResource;
}
