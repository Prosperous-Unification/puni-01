/** How a child process ended: its exit code (`null` when a signal ended it) and output, or why it never started. */
export type ProcessOutcome =
  | {
      readonly kind: 'exited';
      readonly exitCode: number | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: 'unstarted'; readonly reason: string };

/**
 * How a child attached to this process's terminal ended: its exit code, 0 to 255, where a child a
 * signal ended exits 128 plus the signal's number as a POSIX shell reports it; or why it never
 * started.
 */
export type AttachedOutcome =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'unstarted'; readonly reason: string };

/** Runs child processes to completion. */
export interface ProcessRunner {
  /** Runs `argv` (an argument vector, never a shell string) in `cwd` and waits for it. */
  run(argv: readonly string[], options: { readonly cwd: string }): ProcessOutcome;
  /**
   * Runs `argv` (an argument vector, never a shell string) in `cwd` with this process's standard
   * input, output and error, and waits for it.
   */
  runAttached(argv: readonly string[], options: { readonly cwd: string }): AttachedOutcome;
}
