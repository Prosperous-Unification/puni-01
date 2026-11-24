import { defineException } from 'application-exception';

/** A git command a fixture runs that exits non-zero; the fixture cannot be built. */
export const FixtureGitFailed = defineException({
  tag: 'puni/shared-testing/FixtureGitFailed',
  message: ({ args, stderr }: { args: readonly string[]; stderr: string }) =>
    `git ${args.join(' ')}: ${stderr}`,
});

/**
 * A removal the test helpers were asked to make of anything but a path strictly below a scratch
 * root, or of a scratch root this process does not own or cannot prove stale; nothing was removed.
 */
export const ScratchRemovalRefused = defineException({
  tag: 'puni/shared-testing/ScratchRemovalRefused',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `refused to remove ${JSON.stringify(path)}: ${reason}`,
});

/** A scratch directory prefix that would name a path outside the scratch root. */
export const ScratchPrefixRefused = defineException({
  tag: 'puni/shared-testing/ScratchPrefixRefused',
  message: ({ prefix }: { prefix: string }) =>
    `refused the scratch directory prefix ${JSON.stringify(prefix)}: it holds a separator or \`..\``,
});

/** `os.tmpdir()` names a directory that is relative, does not exist or cannot be resolved. */
export const TemporaryDirectoryUnresolved = defineException({
  tag: 'puni/shared-testing/TemporaryDirectoryUnresolved',
  message: ({ temporaryDirectory, reason }: { temporaryDirectory: string; reason: string }) =>
    `the temporary directory ${JSON.stringify(temporaryDirectory)} cannot be resolved: ${reason}`,
});
