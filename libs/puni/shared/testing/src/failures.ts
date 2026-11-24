import { defineException } from 'application-exception';

/** A git command a fixture runs that exits non-zero; the fixture cannot be built. */
export const FixtureGitFailed = defineException({
  tag: 'puni/shared-testing/FixtureGitFailed',
  message: ({ args, stderr }: { args: readonly string[]; stderr: string }) =>
    `git ${args.join(' ')}: ${stderr}`,
});

/**
 * A removal the test helpers were asked to make outside the temporary directory, or of the
 * temporary directory itself; nothing was removed.
 */
export const ScratchRemovalRefused = defineException({
  tag: 'puni/shared-testing/ScratchRemovalRefused',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `refused to remove ${JSON.stringify(path)}: ${reason}`,
});

/** `os.tmpdir()` names a directory that does not exist or cannot be resolved. */
export const TemporaryDirectoryUnresolved = defineException({
  tag: 'puni/shared-testing/TemporaryDirectoryUnresolved',
  message: ({ temporaryDirectory }: { temporaryDirectory: string }) =>
    `the temporary directory ${JSON.stringify(temporaryDirectory)} cannot be resolved`,
});
