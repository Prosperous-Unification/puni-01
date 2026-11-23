import { dirname, posix } from 'node:path';
import type {
  AttachedOutcome,
  Clock,
  DirectoryEntry,
  FileSystem,
  Git,
  GitBranches,
  GitChange,
  GitListing,
  GitMerge,
  GitMerges,
  GitText,
  GitWorktree,
  PathKind,
  ProcessOutcome,
  ProcessRunner,
} from '@puni/shared-ports';

/** One node of a memory tree: a file's text, a symlink's target, or an empty directory. */
export type MemoryNode = string | { readonly symlink: string } | { readonly directory: true };

/** A memory tree by absolute POSIX path; every parent directory of a node exists implicitly. */
export type MemoryTree = Readonly<Record<string, MemoryNode>>;

/** Staged file texts by absolute POSIX path. */
export type MemoryStaged = Readonly<Record<string, string>>;

/** How a memory host answers git and child processes. */
export interface MemoryHostOptions {
  /** Every git listing fails with this reason. */
  readonly gitFailure?: string;
  /** The text the git index holds for each staged file, by absolute path. */
  readonly staged?: MemoryStaged;
  /** The outcome of each argument vector, keyed by its words joined with spaces. */
  readonly processes?: Readonly<Record<string, ProcessOutcome>>;
  /**
   * The exit code of each argument vector run attached, keyed by its words joined with spaces;
   * any other vector is unstarted.
   */
  readonly attached?: Readonly<Record<string, number>>;
  /** The abbreviated `HEAD` commit of each repository by its absolute root; any other has none. */
  readonly heads?: Readonly<Record<string, string>>;
  /**
   * The files `git status` shows changed in each worktree, by its absolute path; read at each
   * call, so a test may change it after the host is made. Any other worktree is clean.
   */
  readonly changed?: Readonly<Record<string, readonly string[]>>;
  /**
   * The branches holding a commit `HEAD` lacks; read at each call. Any other branch is merged.
   */
  readonly unmerged?: readonly string[];
  /** The instant the clock always reads; {@link fixedInstant} when not given. */
  readonly now?: Date;
  /** The home directory; {@link memoryHome} when not given. */
  readonly home?: string;
  /** When each file was last modified, by absolute path; any other file at {@link fixedInstant}. */
  readonly modified?: Readonly<Record<string, Date>>;
  /**
   * The merges `git log` lists in each repository by its absolute root, then by
   * `<ancestry> <revisions>`, newest first; any other revision is unknown.
   */
  readonly merges?: Readonly<Record<string, Readonly<Record<string, readonly GitMerge[]>>>>;
}

/** The instant a memory host's clock reads unless told otherwise. */
export const fixedInstant = new Date('2031-04-05T23:30:00Z');

/** The home directory of a memory host unless told otherwise. */
export const memoryHome = '/home/puni';

/** A failure of the memory file system, carrying the `code` the runtime's own error would. */
class MemoryFileError extends Error {
  override readonly name = 'MemoryFileError';
  readonly code: string;

  constructor(code: string, path: string) {
    super(`${code}: ${path}`);
    this.code = code;
  }
}

/**
 * A mutable in-memory file system over `tree`, keeping the {@link FileSystem} contract the node
 * adapter keeps. A symlink's target resolves from the link's directory; more than eight links in
 * a row are a loop (`ELOOP`); reading a missing path throws `ENOENT` and a directory `EISDIR`.
 * Files were last modified as `options.modified` says, else at {@link fixedInstant}; the home
 * directory is `options.home`, else {@link memoryHome}.
 */
export function createMemoryFileSystem(
  tree: MemoryTree,
  options: Pick<MemoryHostOptions, 'home' | 'modified'> = {},
): FileSystem & {
  readonly nodes: Map<string, MemoryNode>;
} {
  const nodes = new Map<string, MemoryNode>(Object.entries(tree));
  const isDirectory = (path: string): boolean => {
    const node = nodes.get(path);
    if (typeof node === 'object' && 'directory' in node) return true;
    return [...nodes.keys()].some((key) => key.startsWith(`${path === '/' ? '' : path}/`));
  };
  const follow = (path: string, depth = 0): string => {
    const node = nodes.get(path);
    if (typeof node !== 'object' || !('symlink' in node)) return path;
    if (depth > 8) throw new MemoryFileError('ELOOP', path);
    return follow(posix.resolve(dirname(path), node.symlink), depth + 1);
  };
  const kindAt = (path: string): PathKind => {
    const node = nodes.get(path);
    if (typeof node === 'string') return 'file';
    if (node !== undefined && 'symlink' in node) return 'symlink';
    return isDirectory(path) ? 'directory' : 'absent';
  };
  const readText = (path: string): string => {
    const target = follow(path);
    const node = nodes.get(target);
    if (typeof node === 'string') return node;
    throw new MemoryFileError(isDirectory(target) ? 'EISDIR' : 'ENOENT', path);
  };
  return {
    nodes,
    readText,
    *readLines(path) {
      const lines = readText(path).split('\n');
      if (lines.at(-1) === '') lines.pop();
      yield* lines;
    },
    readModifiedTime(path) {
      const target = follow(path);
      if (kindAt(target) === 'absent') throw new MemoryFileError('ENOENT', path);
      return new Date(options.modified?.[target] ?? fixedInstant);
    },
    homeDirectory: () => options.home ?? memoryHome,
    stat: (path, links) => kindAt(links === 'follow' ? follow(path) : path),
    exists(path) {
      try {
        return kindAt(follow(path)) !== 'absent';
      } catch {
        return false;
      }
    },
    readLink(path) {
      const node = nodes.get(path);
      if (typeof node === 'object' && 'symlink' in node) return node.symlink;
      throw new MemoryFileError(kindAt(path) === 'absent' ? 'ENOENT' : 'EINVAL', path);
    },
    list(path): DirectoryEntry[] {
      if (!isDirectory(path)) throw new MemoryFileError('ENOENT', path);
      const names = new Set<string>();
      for (const key of nodes.keys()) {
        if (key.startsWith(`${path}/`)) names.add(key.slice(path.length + 1).split('/')[0] ?? '');
      }
      return [...names].sort().map((name) => {
        const kind = kindAt(posix.join(path, name));
        if (kind === 'absent') throw new MemoryFileError('ENOENT', posix.join(path, name));
        return { name, kind };
      });
    },
    write(path, text) {
      nodes.set(path, text);
    },
    remove(path) {
      for (const key of [...nodes.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) nodes.delete(key);
      }
    },
    makeDirectory(path) {
      if (!isDirectory(path)) nodes.set(path, { directory: true });
    },
    makeLink(path, target) {
      if (kindAt(path) !== 'absent') throw new MemoryFileError('EEXIST', path);
      nodes.set(path, { symlink: target });
    },
  };
}

/**
 * A git that shows every file and symlink of `fileSystem` below the root, ignoring nothing, and
 * holds `staged` in its index, or fails every listing with `failure`. Each repository starts
 * with one worktree, its root on the branch `main`; added worktrees are directories of
 * `fileSystem`, their changes, unmerged branches and merges as `history` says.
 */
export function createMemoryGit(
  fileSystem: ReturnType<typeof createMemoryFileSystem>,
  failure?: string,
  staged: MemoryStaged = {},
  heads: Readonly<Record<string, string>> = {},
  history: Pick<MemoryHostOptions, 'changed' | 'unmerged' | 'merges'> = {},
): Git {
  const repositories = new Map<string, { worktrees: GitWorktree[]; branches: Set<string> }>();
  const open = (root: string) => {
    for (const repository of repositories.values()) {
      if (repository.worktrees.some((worktree) => worktree.path === root)) return repository;
    }
    const created = { worktrees: [{ path: root, branch: 'main' }], branches: new Set(['main']) };
    repositories.set(root, created);
    return created;
  };
  const changedIn = (path: string): readonly string[] => history.changed?.[path] ?? [];
  const isUnmerged = (branch: string): boolean => history.unmerged?.includes(branch) ?? false;
  return {
    listWorktrees: (root) => ({ worktrees: [...open(root).worktrees] }),
    listBranches(root, prefix, filter): GitBranches {
      const branches = [...open(root).branches]
        .filter((name) => name === prefix || name.startsWith(`${prefix}/`))
        .filter((name) => filter === 'all' || isUnmerged(name))
        .sort();
      return { branches };
    },
    listChangedFiles: (root) => ({ files: [...changedIn(root)] }),
    addWorktree(root, path, branch): GitChange {
      const repository = open(root);
      if (repository.branches.has(branch)) return { failure: `a branch named ${branch} exists` };
      if (fileSystem.exists(path)) return { failure: `${path} already exists` };
      repository.worktrees.push({ path, branch });
      repository.branches.add(branch);
      fileSystem.makeDirectory(path);
      return { changed: true };
    },
    removeWorktree(root, path, force): GitChange {
      const repository = open(root);
      const index = repository.worktrees.findIndex((worktree) => worktree.path === path);
      if (index <= 0) return { failure: `${path} is not a linked worktree` };
      if (!force && changedIn(path).length > 0) return { failure: `${path} has changes` };
      repository.worktrees.splice(index, 1);
      fileSystem.remove(path);
      return { changed: true };
    },
    deleteBranch(root, branch, force): GitChange {
      const repository = open(root);
      if (!repository.branches.has(branch)) return { failure: `no branch named ${branch}` };
      if (repository.worktrees.some((worktree) => worktree.branch === branch)) {
        return { failure: `${branch} is checked out` };
      }
      if (!force && isUnmerged(branch)) return { failure: `${branch} is not fully merged` };
      repository.branches.delete(branch);
      return { changed: true };
    },
    listMerges(root, revisions, ancestry): GitMerges {
      const merges = history.merges?.[root]?.[`${ancestry} ${revisions}`];
      return merges === undefined
        ? { failure: `unknown revision ${revisions} in ${root}` }
        : { merges: [...merges] };
    },
    readHeadCommit(root): GitText {
      const head = heads[root];
      return head === undefined ? { failure: `${root} has no commit` } : { text: head };
    },
    listStagedFiles(root): GitListing {
      if (failure !== undefined) return { failure };
      const files = Object.keys(staged)
        .filter((path) => path.startsWith(`${root}/`))
        .map((path) => path.slice(root.length + 1))
        .sort();
      return { files };
    },
    readStagedText(root, path): GitText {
      const text = staged[posix.join(root, path)];
      return text === undefined ? { failure: `${path} is not staged` } : { text };
    },
    listVisibleFiles(root): GitListing {
      if (failure !== undefined) return { failure };
      const files = [...fileSystem.nodes]
        .filter(
          ([path, node]) =>
            path.startsWith(`${root}/`) && !(typeof node === 'object' && 'directory' in node),
        )
        .map(([path]) => path.slice(root.length + 1))
        .sort();
      return { files };
    },
  };
}

/**
 * A process runner that answers from `processes` and, run attached, from `attached`, leaving any
 * other command unstarted. Every attached argument vector is appended to `attachedRuns` as given.
 */
export function createMemoryProcessRunner(
  processes: Readonly<Record<string, ProcessOutcome>> = {},
  attached: Readonly<Record<string, number>> = {},
): ProcessRunner & { readonly attachedRuns: (readonly string[])[] } {
  const unstarted = (argv: readonly string[]) =>
    ({ kind: 'unstarted', reason: `${argv.join(' ')} is not in the memory host` }) as const;
  const attachedRuns: (readonly string[])[] = [];
  return {
    attachedRuns,
    run: (argv) => processes[argv.join(' ')] ?? unstarted(argv),
    runAttached(argv): AttachedOutcome {
      attachedRuns.push([...argv]);
      const exitCode = attached[argv.join(' ')];
      return exitCode === undefined ? unstarted(argv) : { kind: 'exited', exitCode };
    },
  };
}

/**
 * The host services a module needs, all in memory over `tree`: providers for `fileSystem`,
 * `git`, `processRunner` and a fixed `clock`, to pass to `withServices`. `fileSystem` is shared,
 * so writes are visible to git and to the test through {@link MemoryHost.nodes}; every attached
 * run is in {@link MemoryHost.attachedRuns}.
 */
export function memoryHost(tree: MemoryTree, options: MemoryHostOptions = {}) {
  const fileSystem = createMemoryFileSystem(tree, options);
  const git = createMemoryGit(
    fileSystem,
    options.gitFailure,
    options.staged,
    options.heads,
    options,
  );
  const processRunner = createMemoryProcessRunner(options.processes, options.attached);
  const now = options.now ?? fixedInstant;
  const clock: Clock = { now: () => new Date(now) };
  return {
    nodes: fileSystem.nodes,
    attachedRuns: processRunner.attachedRuns,
    services: {
      fileSystem: (): FileSystem => fileSystem,
      git: (): Git => git,
      processRunner: (): ProcessRunner => processRunner,
      clock: (): Clock => clock,
    },
  };
}

/** What {@link memoryHost} returns. */
export type MemoryHost = ReturnType<typeof memoryHost>;
