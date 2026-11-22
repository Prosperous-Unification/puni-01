import { join, posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { CheckoutFiles, CheckoutFilesResource, FileSystem, Git } from './contract';
import type { GitListing } from '@puni/shared-ports';
import { CheckoutPathRefused } from './failures';
import { ownsPath } from './ownership';
import { indexDirectory } from './render-index';

function refuse(path: string, reason: string): never {
  throw new CheckoutPathRefused({ details: { path, reason } });
}

/** `path` normalised, refused when it is absolute or leaves the root. */
function normalise(path: string): string {
  const normal = posix.normalize(path);
  if (posix.isAbsolute(normal) || normal === '..' || normal.startsWith('../')) {
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

function openCheckout(root: string, fileSystem: FileSystem, git: Git): CheckoutFiles {
  let listing: GitListing | undefined;
  const listGit = (): GitListing => (listing ??= git.listVisibleFiles(root));
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
    readText: (path) => fileSystem.readText(absolute(path)),
    describe,
    exists: (path) => fileSystem.stat(absolute(path), 'follow') !== 'absent',
    readLinkTarget: (path) => fileSystem.readLink(absolute(path)),
    listVisible(scope) {
      const listing = listGit();
      if ('failure' in listing) return listing;
      return {
        files: listing.files
          .filter((path) => ownsPath(scope, path) && describe(path) === 'file')
          .sort(compareBytes),
      };
    },
    listVisibleEntries() {
      const listing = listGit();
      if ('failure' in listing) return listing;
      return {
        entries: [...listing.files].sort(compareBytes).flatMap((path) => {
          const kind = describe(path);
          return kind === 'absent' ? [] : [{ path, kind }];
        }),
      };
    },
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

/** The {@link CheckoutFilesResource} over `fileSystem` and `git`. */
export function createCheckoutFiles({
  fileSystem,
  git,
}: {
  fileSystem: FileSystem;
  git: Git;
}): CheckoutFilesResource {
  return { open: (root) => openCheckout(root, fileSystem, git) };
}
