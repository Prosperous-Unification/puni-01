import { join, posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { CheckoutFiles, CheckoutFilesResource, FileSystem, Git, GitListing } from './contract';
import { CheckoutPathRefused, CheckoutUnlistable, StagedTextUnreadable } from './failures';
import { ownsPath } from './ownership';
import { leavesRoot } from './paths';
import { indexDirectory } from './render-index';
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

/** `path` normalised, refused unless it lies inside the generated index directory. */
function normaliseGenerated(path: string, allowDirectory: boolean): string {
  const normal = normalise(path);
  if (!(normal.startsWith(`${indexDirectory}/`) || (allowDirectory && normal === indexDirectory))) {
    refuse(path, `is outside ${indexDirectory}/, the only place a checkout writes`);
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

function openCheckout(root: string, fileSystem: FileSystem, git: Git): CheckoutFiles {
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
    readText(path) {
      const file = absolute(path);
      return readOrRefuse(path, () => fileSystem.readText(file));
    },
    describe,
    exists: (path) => fileSystem.exists(absolute(path)),
    readLinkTarget: (path) => fileSystem.readLink(absolute(path)),
    listVisible: (scope) =>
      listGit().filter((path) => ownsPath(scope, path) && describe(path) === 'file'),
    listVisibleEntries: () =>
      listGit().flatMap((path) => {
        const kind = describe(path);
        return kind === 'absent' ? [] : [{ path, kind }];
      }),
    write(path, text) {
      const normal = normaliseGenerated(path, false);
      fileSystem.makeDirectory(join(root, posix.dirname(normal)));
      fileSystem.write(join(root, normal), text);
    },
    remove(path) {
      fileSystem.remove(join(root, normaliseGenerated(path, false)));
    },
    removeEmptyDirectories(directory) {
      removeEmptyBelow(normaliseGenerated(directory, true));
    },
  };
}

/** The staged view of the checkout at `root`: what the git index holds, read-only. */
function openStaged(root: string, fileSystem: FileSystem, git: Git): CheckoutFiles {
  const working = openCheckout(root, fileSystem, git);
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
    listVisible: (scope) => listStaged().filter((path) => ownsPath(scope, path)),
    listVisibleEntries: () => listStaged().map((path) => ({ path, kind: 'file' })),
    write: readOnly,
    remove: readOnly,
    removeEmptyDirectories: readOnly,
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
    open: (root) => openCheckout(root, fileSystem, git),
    openStaged: (root) => openStaged(root, fileSystem, git),
  };
}
