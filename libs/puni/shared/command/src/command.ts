/** What a command may touch outside its request. */
export interface Io {
  /** The directory commands that look for the repository start from. */
  readonly cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
}

/**
 * The exit code of a command: 0 success, 1 a judgement failed or the repository is defective, 2
 * the command line named something the repository does not have.
 */
export type CommandExitCode = 0 | 1 | 2;

/** The exit code of an unexpected failure, which is reported and never a command's own. */
export const unexpectedFailureExitCode = 3;

/** One `puni` leaf command: it runs a parsed request against `io` and returns its exit code. */
export interface Command<Request> {
  run(request: Request, io: Io): CommandExitCode;
}
