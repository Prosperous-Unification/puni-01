/** What a command may touch outside its request. */
export interface Io {
  /** The directory commands that look for the repository start from. */
  readonly cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
}

/**
 * The exit code of a command: 0 success, 1 a judgement failed or the repository is defective, 2
 * the command line named something the repository does not have. A pass-through command, once it
 * has started the command it passes through, returns that command's own exit code, 0 to 255,
 * unchanged; so the type is every exit code a process can have.
 */
export type CommandExitCode = number;

/** The exit code of an unexpected failure, which is reported and never a command's own. */
export const unexpectedFailureExitCode = 3;

/** One `puni` leaf command: it runs a parsed request against `io` and returns its exit code. */
export interface Command<Request> {
  run(request: Request, io: Io): CommandExitCode;
}
