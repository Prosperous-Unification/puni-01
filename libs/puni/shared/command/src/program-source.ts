/**
 * Where the running `puni` program's code lives, and its version: a directory inside the system-state checkout it
 * runs from, whose nearest `puni.json` and `AGENTS.md` are that checkout's. The app supplies it.
 */
export interface ProgramSource {
  readonly directory: string;
  /** The program's version, as `puni --version` prints it. */
  readonly version: string;
}
