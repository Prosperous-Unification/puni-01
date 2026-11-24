import { join, posix } from 'node:path';
import { compareBytes } from './byte-order';
import type {
  CheckoutFiles,
  CheckoutFilesResource,
  CommitCheckout,
  FileSystem,
  Git,
  GitListing,
  NewCheckout,
  NewCheckoutPlace,
} from './contract';
import {
  CheckoutPathRefused,
  CheckoutRootRefused,
  CheckoutUnlistable,
  CommitsUnlistable,
  HeadCommitUnreadable,
  RevisionUnknown,
  StagedTextUnreadable,
} from './failures';
import { ownsPath } from './ownership';
import { commitMessagePath, leavesRoot } from './paths';
import { recordDirectories } from './record-directories';
import type { RepositoryType } from './registry';
import { indexDirectory } from './render-index';
import { seedFiles } from './seed-files';
import { readOrRefuse } from './unreadable';

function refuse(path: string, reason: string): never {
  throw new CheckoutPathRefused({ details: { path, reason } });
}

/** `path` normalised, refused when it is absolute or leaves the root. */
function normalise(path: string): string {
  const normal = posix.normalize(path);
  if (posix.isAbsolute(normal) || leavesRoot(normal)) {
    refuse(path, 'is not a path inside the checkout');
  }
  return normal;
}

/** Where a checkout writes: the files and the directories it may change, and how to say so. */
interface WriteArea {
  readonly description: string;
  holdsFile(normal: string): boolean;
  holdsDirectory(normal: string): boolean;
}

const kindDirectories: readonly string[] = Object.values(recordDirectories);

/**
 * The write area of a checkout of each type: a system-state checkout writes only the generated
 * index, anywhere below `wiki/index/`, and may remove a file standing where `wiki/index` belongs;
 * a records checkout writes only record files, directly inside a kind directory, and empties no
 * directory.
 */
const writeAreas: Readonly<Record<RepositoryType, WriteArea>> = {
  'system-state': {
    description: `inside ${indexDirectory}/`,
    holdsFile: (normal) => normal === indexDirectory || normal.startsWith(`${indexDirectory}/`),
    holdsDirectory: (normal) =>
      normal === indexDirectory || normal.startsWith(`${indexDirectory}/`),
  },
  'system-records': {
    description: `directly inside a kind directory (${kindDirectories.join(', ')})`,
    holdsFile: (normal) => kindDirectories.includes(posix.dirname(normal)),
    holdsDirectory: () => false,
  },
};

/** `path` normalised, refused unless the write area of a `type` checkout holds it. */
function normaliseWritten(path: string, type: RepositoryType, directory: boolean): string {
  const normal = normalise(path);
  const area = writeAreas[type];
  if (!(directory ? area.holdsDirectory(normal) : area.holdsFile(normal))) {
    refuse(path, `is not ${area.description}, the only place a ${type} checkout writes`);
  }
  return normal;
}

/** The files of `listing`, sorted by their bytes; a failure is the one defect of every listing. */
function requireListed(listing: GitListing): string[] {
  if ('failure' in listing) {
    throw new CheckoutUnlistable({
      details: { rule: 'repository.git', path: '.', reason: listing.failure },
    });
  }
  return [...listing.files].sort(compareBytes);
}

/** Asks `list` once, on the first call, and answers every later call the same. */
function listOnce(list: () => GitListing): () => string[] {
  let listed: string[] | undefined;
  return () => (listed ??= requireListed(list()));
}

function openCheckout(
  root: string,
  type: RepositoryType,
  fileSystem: FileSystem,
  git: Git,
): CheckoutFiles {
  const listGit = listOnce(() => git.listVisibleFiles(root));
  const absolute = (path: string): string => join(root, normalise(path));
  const describe: CheckoutFiles['describe'] = (path) =>
    fileSystem.stat(absolute(path), 'no-follow');
  const removeEmptyBelow = (directory: string): void => {
    for (const entry of fileSystem.list(join(root, directory))) {
      if (entry.kind !== 'directory') continue;
      const path = posix.join(directory, entry.name);
      removeEmptyBelow(path);
      if (fileSystem.list(join(root, path)).length === 0) fileSystem.remove(join(root, path));
    }
  };
  return {
    root,
    readText(path) {
      const file = absolute(path);
      return readOrRefuse(path, () => fileSystem.readText(file));
    },
    describe,
    exists: (path) => fileSystem.exists(absolute(path)),
    isShown: (path) => isShownIn(listGit(), path, (shown) => describe(shown) === 'file'),
    readLinkTarget: (path) => fileSystem.readLink(absolute(path)),
    listVisible: (scope) =>
      listGit().filter((path) => ownsPath(scope, path) && describe(path) === 'file'),
    listVisibleEntries: () =>
      listGit().flatMap((path) => {
        const kind = describe(path);
        return kind === 'absent' ? [] : [{ path, kind }];
      }),
    readHeadCommit() {
      const head = git.readHeadCommit(root);
      if ('failure' in head) {
        throw new HeadCommitUnreadable({
          details: { rule: 'repository.git', path: '.', root, reason: head.failure },
        });
      }
      return head.text;
    },
    write(path, text) {
      const normal = normaliseWritten(path, type, false);
      fileSystem.makeDirectory(join(root, posix.dirname(normal)));
      fileSystem.write(join(root, normal), text);
    },
    remove(path) {
      fileSystem.remove(join(root, normaliseWritten(path, type, false)));
    },
    removeEmptyDirectories(directory) {
      removeEmptyBelow(normaliseWritten(directory, type, true));
    },
  };
}

/** The staged view of the checkout at `root`: what the git index holds, read-only. */
function openStaged(root: string, fileSystem: FileSystem, git: Git): CheckoutFiles {
  const working = openCheckout(root, 'system-state', fileSystem, git);
  const listStaged = listOnce(() => git.listStagedFiles(root));
  const readOnly = (path: string): never => refuse(path, 'a staged view writes nothing');
  return {
    ...working,
    readText(path) {
      const staged = git.readStagedText(root, normalise(path));
      if ('failure' in staged) {
        throw new StagedTextUnreadable({ details: { path, reason: staged.failure } });
      }
      return staged.text;
    },
    isShown: (path) => isShownIn(listStaged(), path, () => true),
    listVisible: (scope) => listStaged().filter((path) => ownsPath(scope, path)),
    listVisibleEntries: () => listStaged().map((path) => ({ path, kind: 'file' })),
    write: readOnly,
    remove: readOnly,
    removeEmptyDirectories: readOnly,
  };
}

/**
 * The commits of `base..head` in the checkout at `root`, each as its view, as
 * {@link CheckoutFilesResource.openCommits} says.
 */
function openCommits(
  root: string,
  base: string,
  head: string,
  fileSystem: FileSystem,
  git: Git,
): readonly CommitCheckout[] {
  const listed = git.listCommits(root, base, head);
  if ('unknown' in listed) throw new RevisionUnknown({ details: { revision: listed.unknown } });
  if ('failure' in listed) {
    throw new CommitsUnlistable({
      details: {
        rule: 'repository.git',
        path: '.',
        range: `${base}..${head}`,
        reason: listed.failure,
      },
    });
  }
  const workingTree = openCheckout(root, 'system-state', fileSystem, git);
  const readOnly = (path: string): never => refuse(path, 'a commit view writes nothing');
  /** A read-only view whose visible files are the keys of `linesByPath`, read as their lines. */
  const view = (shortHash: string, linesByPath: ReadonlyMap<string, readonly string[]>) => {
    const paths = [...linesByPath.keys()].sort(compareBytes);
    const files: CheckoutFiles = {
      ...workingTree,
      readText(path) {
        const lines = linesByPath.get(normalise(path));
        if (lines === undefined) refuse(path, `is not a path commit ${shortHash} adds to`);
        return lines.join('\n');
      },
      isShown: (path) => isShownIn(paths, path, () => true),
      listVisible: (scope) => paths.filter((path) => ownsPath(scope, path)),
      listVisibleEntries: () => paths.map((path) => ({ path, kind: 'file' })),
      write: readOnly,
      remove: readOnly,
      removeEmptyDirectories: readOnly,
    };
    return files;
  };
  return listed.commits.map(({ fullHash, shortHash, message, addedLines }) => {
    const addedLinesByPath = new Map<string, string[]>();
    for (const { path, line, text } of addedLines) {
      const lines = addedLinesByPath.get(path) ?? [];
      while (lines.length < line) lines.push('');
      lines[line - 1] = text;
      addedLinesByPath.set(path, lines);
    }
    return {
      fullHash,
      shortHash,
      files: view(shortHash, addedLinesByPath),
      message: view(shortHash, new Map([[commitMessagePath, message.split('\n')]])),
    };
  });
}

/**
 * Whether `path`, repository-relative with no trailing slash, is one of `listed` or a directory
 * above one, counting only listed paths `present` accepts.
 */
function isShownIn(
  listed: readonly string[],
  path: string,
  present: (listedPath: string) => boolean,
): boolean {
  const target = path.replace(/\/+$/u, '');
  if (target === '' || target === '.') return true;
  return listed.some(
    (shown) => (shown === target || shown.startsWith(`${target}/`)) && present(shown),
  );
}

/** Refuses `root` unless it is `place`, as {@link CheckoutFilesResource.create} says. */
function requirePlace(root: string, place: NewCheckoutPlace, fileSystem: FileSystem): void {
  const kind = fileSystem.stat(root, 'no-follow');
  const refuseRoot = (reason: string): never => {
    throw new CheckoutRootRefused({ details: { root, reason } });
  };
  if (place === 'absent') {
    if (kind !== 'absent') refuseRoot('already exists; a new repository goes where nothing is');
    return;
  }
  if (kind !== 'directory') refuseRoot(`is not a directory (${kind})`);
  const held = fileSystem
    .list(root)
    .map((entry) => entry.name)
    .filter((name) => name !== '.git')
    .sort(compareBytes);
  if (held.length > 0) {
    refuseRoot(
      `holds ${held.join(', ')}; a new repository starts in an empty directory, where only .git may exist`,
    );
  }
}

/**
 * The {@link NewCheckout} at `root`: it adds the {@link seedFiles} of `type` and, for a
 * system-state repository, files inside the generated index, each only where nothing exists.
 */
function createCheckout(
  root: string,
  type: RepositoryType,
  place: NewCheckoutPlace,
  fileSystem: FileSystem,
): NewCheckout {
  requirePlace(root, place, fileSystem);
  const seeds = seedFiles[type];
  const holdsIndex = (normal: string): boolean =>
    type === 'system-state' && normal.startsWith(`${indexDirectory}/`);
  const normaliseNew = (path: string, kind: 'file' | 'symlink'): string => {
    const normal = normalise(path);
    if (seeds[normal] !== kind && !(kind === 'file' && holdsIndex(normal))) {
      const listed = Object.keys(seeds).filter((seed) => seeds[seed] === kind);
      const index =
        kind === 'file' && type === 'system-state' ? `, or inside ${indexDirectory}/` : '';
      refuse(
        path,
        `is not a ${kind} a new ${type} repository starts with (${listed.join(', ')}${index})`,
      );
    }
    if (fileSystem.stat(join(root, normal), 'no-follow') !== 'absent') {
      refuse(path, 'already exists; a new repository replaces nothing');
    }
    return normal;
  };
  return {
    root,
    write(path, text) {
      const normal = normaliseNew(path, 'file');
      fileSystem.makeDirectory(join(root, posix.dirname(normal)));
      fileSystem.write(join(root, normal), text);
    },
    link(path, target) {
      const normal = normaliseNew(path, 'symlink');
      fileSystem.makeDirectory(root);
      fileSystem.makeLink(join(root, normal), target);
    },
  };
}

/** The {@link CheckoutFilesResource} over `fileSystem` and `git`. */
export function createCheckoutFiles({
  fileSystem,
  git,
}: {
  fileSystem: FileSystem;
  git: Git;
}): CheckoutFilesResource {
  return {
    open: (root, type) => openCheckout(root, type, fileSystem, git),
    openStaged: (root) => openStaged(root, fileSystem, git),
    openCommits: (root, base, head) => openCommits(root, base, head, fileSystem, git),
    create: (root, type, place) => createCheckout(root, type, place, fileSystem),
  };
}
