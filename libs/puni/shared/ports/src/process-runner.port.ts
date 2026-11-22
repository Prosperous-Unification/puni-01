/** How a child process ended: its exit code (`null` when a signal ended it) and output, or why it never started. */
export type ProcessOutcome =
  | {
      readonly kind: 'exited';
      readonly exitCode: number | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: 'unstarted'; readonly reason: string };

/** Runs child processes to completion. */
export interface ProcessRunner {
  /** Runs `argv` (an argument vector, never a shell string) in `cwd` and waits for it. */
  run(argv: readonly string[], options: { readonly cwd: string }): ProcessOutcome;
}
