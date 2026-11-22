import {
  type CommandExitCode,
  type Io,
  printHelp,
  readInvocation,
  UsageRefused,
} from '@puni/shared-command';
import type { CheckExports } from '@puni/burokrat-check';
import type { WikiExports } from '@puni/burokrat-wiki';
import { createPuniContainer } from './composition';
import { handlerKeys, puniProgram, selectLeaf } from './root-parser';

type CommandExports = CheckExports & WikiExports;

/** What `runPuni` needs of a container: the command services by their keys. */
export interface CommandContainer {
  resolve<Key extends keyof CommandExports>(key: Key): CommandExports[Key];
}

/**
 * Runs one `puni` command line against `container` and returns its exit code: 0 on success, 1
 * when a judgement failed or the repository's inputs are defective, 2 when the command line is
 * refused or names something the repository does not have. A bare group or sub-group prints its
 * own help. Anything unexpected propagates.
 */
export function runPuni(
  args: readonly string[],
  io: Io,
  container: CommandContainer,
): CommandExitCode {
  let invocation;
  try {
    invocation = readInvocation(puniProgram, args, (text) => {
      io.stdout(text);
    });
  } catch (caught) {
    if (!(caught instanceof UsageRefused)) throw caught;
    io.stderr(`error: ${caught.message}\n`);
    return 2;
  }
  if (invocation.kind === 'printed') return 0;
  const leaf = selectLeaf(invocation.command);
  switch (leaf.kind) {
    case 'help':
      printHelp(puniProgram, leaf.path, (text) => {
        io.stdout(text);
      });
      return 0;
    case 'burokrat check':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat wiki index':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
  }
}

/** Optique hands over help pages with their final newline but the version without one. */
function writeLine(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Runs `puni` for this process: its arguments, working directory and streams. Sets
 * `process.exitCode`, never exits, and closes the container before it returns or rethrows.
 */
export async function runProcess(): Promise<void> {
  const container = createPuniContainer();
  try {
    process.exitCode = runPuni(
      process.argv.slice(2),
      {
        cwd: process.cwd(),
        stdout: writeLine,
        stderr: (text) => {
          process.stderr.write(text);
        },
      },
      container,
    );
  } finally {
    await container.close();
  }
}
