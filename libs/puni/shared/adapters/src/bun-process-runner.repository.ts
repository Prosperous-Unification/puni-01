import type { ProcessRunner } from '@puni/shared-ports';

/** The {@link ProcessRunner} of this machine, through `Bun.spawnSync`; output is read as UTF-8. */
export function createBunProcessRunner(): ProcessRunner {
  return {
    run(argv, { cwd }) {
      let child;
      try {
        child = Bun.spawnSync([...argv], { cwd, stdout: 'pipe', stderr: 'pipe' });
      } catch (cause) {
        return {
          kind: 'unstarted',
          reason: cause instanceof Error ? cause.message : String(cause),
        };
      }
      return {
        kind: 'exited',
        exitCode: child.exitCode,
        stdout: child.stdout.toString(),
        stderr: child.stderr.toString(),
      };
    },
  };
}
