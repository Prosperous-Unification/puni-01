import { createPuniContainer } from './composition';
import { runPuni } from './main';

/** How one command line ended: its exit code and everything it printed on each stream. */
export interface PuniRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The real composition, open, and a way to run command lines against it in this process. */
export interface InProcessPuni {
  /**
   * Runs `args` from `cwd` as the entrypoint would, without spawning it: the real container, its
   * output collected. A child a command attaches to this terminal writes to the test's own
   * streams, so its output is not collected; a spawned run proves that.
   */
  run(args: readonly string[], cwd: string): PuniRun;
  /** Closes the container. */
  close(): Promise<void>;
}

/** Opens the real composition for in-process runs; close it once the suite is done. */
export function openInProcessPuni(): InProcessPuni {
  const container = createPuniContainer();
  return {
    run(args, cwd) {
      let stdout = '';
      let stderr = '';
      const code = runPuni(
        args,
        {
          cwd,
          stdout: (text) => {
            stdout += text;
          },
          stderr: (text) => {
            stderr += text;
          },
        },
        container,
      );
      return { code, stdout, stderr };
    },
    close: () => container.close(),
  };
}
