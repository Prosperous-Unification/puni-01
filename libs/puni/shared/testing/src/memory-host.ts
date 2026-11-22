import { dirname, posix } from 'node:path';
import type {
  DirectoryEntry,
  FileSystem,
  Git,
  GitListing,
  GitText,
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
}

function missing(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT',
  });
}

/**
 * A mutable in-memory file system over `tree`. A symlink's target resolves from the link's
 * directory; reading through a dangling link or a missing path throws an `ENOENT` error.
 */
export function createMemoryFileSystem(tree: MemoryTree): FileSystem & {
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
    if (depth > 8) throw new Error(`ELOOP: ${path}`);
    return follow(posix.resolve(dirname(path), node.symlink), depth + 1);
  };
  const kindAt = (path: string): PathKind => {
    const node = nodes.get(path);
    if (typeof node === 'string') return 'file';
    if (node !== undefined && 'symlink' in node) return 'symlink';
    return isDirectory(path) ? 'directory' : 'absent';
  };
  return {
    nodes,
    readText(path) {
      const node = nodes.get(follow(path));
      if (typeof node !== 'string') throw missing(path);
      return node;
    },
    stat: (path, links) => kindAt(links === 'follow' ? follow(path) : path),
    readLink(path) {
      const node = nodes.get(path);
      if (typeof node !== 'object' || !('symlink' in node)) throw missing(path);
      return node.symlink;
    },
    list(path): DirectoryEntry[] {
      if (!isDirectory(path)) throw missing(path);
      const names = new Set<string>();
      for (const key of nodes.keys()) {
        if (key.startsWith(`${path}/`)) names.add(key.slice(path.length + 1).split('/')[0] ?? '');
      }
      return [...names].sort().map((name) => {
        const kind = kindAt(posix.join(path, name));
        if (kind === 'absent') throw missing(posix.join(path, name));
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
  };
}

/**
 * A git that shows every file and symlink of `fileSystem` below the root, ignoring nothing, and
 * holds `staged` in its index, or fails every listing with `failure`.
 */
export function createMemoryGit(
  fileSystem: ReturnType<typeof createMemoryFileSystem>,
  failure?: string,
  staged: MemoryStaged = {},
): Git {
  return {
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

/** A process runner that answers from `processes`, and leaves any other command unstarted. */
export function createMemoryProcessRunner(
  processes: Readonly<Record<string, ProcessOutcome>> = {},
): ProcessRunner {
  return {
    run(argv) {
      const outcome = processes[argv.join(' ')];
      return (
        outcome ?? { kind: 'unstarted', reason: `${argv.join(' ')} is not in the memory host` }
      );
    },
  };
}

/**
 * The host services a module needs, all in memory over `tree`: providers for `fileSystem`,
 * `git` and `processRunner`, to pass to `withServices`. `fileSystem` is shared, so writes are
 * visible to git and to the test through {@link MemoryHost.nodes}.
 */
export function memoryHost(tree: MemoryTree, options: MemoryHostOptions = {}) {
  const fileSystem = createMemoryFileSystem(tree);
  const git = createMemoryGit(fileSystem, options.gitFailure, options.staged);
  const processRunner = createMemoryProcessRunner(options.processes);
  return {
    nodes: fileSystem.nodes,
    services: {
      fileSystem: (): FileSystem => fileSystem,
      git: (): Git => git,
      processRunner: (): ProcessRunner => processRunner,
    },
  };
}

/** What {@link memoryHost} returns. */
export type MemoryHost = ReturnType<typeof memoryHost>;
