import { constants } from 'node:os';
import type { ProcessRunner } from '@puni/shared-ports';
import { SignalUnknown } from './failures';

/** Why `spawn` could not start its child: the runtime's message. */
function describeUnstarted(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The exit code of a child the signal `signalCode` ended: 128 plus the signal's number, as a POSIX
 * shell reports it.
 *
 * @throws SignalUnknown when the runtime names a signal this platform has no number for.
 */
function exitCodeOfSignal(signalCode: string | number): number {
  if (typeof signalCode === 'number') return 128 + signalCode;
  const number = Object.entries(constants.signals).find(([name]) => name === signalCode)?.[1];
  if (number === undefined) throw new SignalUnknown({ details: { signalCode } });
  return 128 + number;
}

/**
 * The {@link ProcessRunner} of this machine, through `Bun.spawnSync`; output is read as UTF-8. An
 * attached child inherits this process's standard streams, so it reads and writes the terminal.
 */
export function createBunProcessRunner(): ProcessRunner {
  return {
    run(argv, { cwd }) {
      let child;
      try {
        child = Bun.spawnSync([...argv], { cwd, stdout: 'pipe', stderr: 'pipe' });
      } catch (cause) {
        return { kind: 'unstarted', reason: describeUnstarted(cause) };
      }
      return {
        kind: 'exited',
        exitCode: child.exitCode,
        stdout: child.stdout.toString(),
        stderr: child.stderr.toString(),
      };
    },
    runAttached(argv, { cwd }) {
      let child;
      try {
        child = Bun.spawnSync([...argv], { cwd, stdio: ['inherit', 'inherit', 'inherit'] });
      } catch (cause) {
        return { kind: 'unstarted', reason: describeUnstarted(cause) };
      }
      const exitCode =
        child.signalCode === undefined ? child.exitCode : exitCodeOfSignal(child.signalCode);
      return { kind: 'exited', exitCode };
    },
  };
}
