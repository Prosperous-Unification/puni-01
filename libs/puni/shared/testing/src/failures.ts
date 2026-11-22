import { defineException } from 'application-exception';

/** A git command a fixture runs that exits non-zero; the fixture cannot be built. */
export const FixtureGitFailed = defineException({
  tag: 'puni/shared-testing/FixtureGitFailed',
  message: ({ args, stderr }: { args: readonly string[]; stderr: string }) =>
    `git ${args.join(' ')}: ${stderr}`,
});
