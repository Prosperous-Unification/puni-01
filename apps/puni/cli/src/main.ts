import {
  type CommandExitCode,
  type Io,
  printHelp,
  readInvocation,
  UsageRefused,
} from '@puni/shared-command';
import type { AdrExports } from '@puni/burokrat-adr';
import type { AssessExports } from '@puni/burokrat-assess';
import type { CheckExports } from '@puni/burokrat-check';
import type { RepoExports } from '@puni/burokrat-repo';
import type { WikiExports } from '@puni/burokrat-wiki';
import type { OpsExports } from '@puni/dash-ops';
import type { ResourcesExports } from '@puni/dash-resources';
import type { RunExports } from '@puni/dash-run';
import type { PlanExports } from '@puni/navigator-plan';
import type { ResearchExports } from '@puni/navigator-research';
import { createPuniContainer } from './composition';
import { handlerKeys, type Leaf, puniProgram, selectLeaf } from './root-parser';

type CommandExports = PlanExports &
  ResearchExports &
  OpsExports &
  RunExports &
  ResourcesExports &
  CheckExports &
  WikiExports &
  RepoExports &
  AdrExports &
  AssessExports;

/** What `runPuni` needs of a container: the command services by their keys. */
export interface CommandContainer {
  resolve<Key extends keyof CommandExports>(key: Key): CommandExports[Key];
}

/**
 * What a command line selected, as a failure report records it in place of the arguments, which
 * may hold anything: a leaf's kind, `help`, `printed` for help, version or completion Optique
 * printed, or `refused`.
 */
export type CommandSelection = Leaf['kind'] | 'printed' | 'refused';

/**
 * Runs one `puni` command line against `container` and returns its exit code: 0 on success, 1
 * when a judgement failed or the repository's inputs are defective, 2 when the command line is
 * refused or names something the repository does not have; a pass-through command returns its
 * remote command's own exit code once it started it. A bare group or sub-group prints its own
 * help. `select` hears what the line selected before anything runs. Anything unexpected
 * propagates.
 */
export function runPuni(
  args: readonly string[],
  io: Io,
  container: CommandContainer,
  select: (selection: CommandSelection) => void = () => undefined,
): CommandExitCode {
  let invocation;
  try {
    invocation = readInvocation(puniProgram, args, (text) => {
      io.stdout(text);
    });
  } catch (caught) {
    if (!(caught instanceof UsageRefused)) throw caught;
    select('refused');
    io.stderr(`error: ${caught.message}\n`);
    return 2;
  }
  if (invocation.kind === 'printed') {
    select('printed');
    return 0;
  }
  const leaf = selectLeaf(invocation.command);
  select(leaf.kind);
  switch (leaf.kind) {
    case 'help':
      printHelp(puniProgram, leaf.path, (text) => {
        io.stdout(text);
      });
      return 0;
    case 'navigator plan add':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'navigator research add':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash ops ssh':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash ops k3s':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash run log':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash resources create':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash resources list':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash resources exec':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'dash resources remove':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat check':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat wiki index':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat repo init':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat adr add':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
    case 'burokrat assess outcomes':
      return container.resolve(handlerKeys[leaf.kind]).run(leaf.request, io);
  }
}

/** Optique hands over help pages with their final newline but the version without one. */
function writeLine(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Runs `puni` for this process: its arguments, working directory and streams, against
 * `container`, telling `select` what the line selected. Sets `process.exitCode`, never exits,
 * and closes the container before it returns or rethrows. When the command throws and closing
 * then fails too, it throws an `AggregateError` of the command's failure, then the close
 * failure; a close failure alone is thrown as it is.
 */
export async function runProcess(
  select: (selection: CommandSelection) => void,
  container: CommandContainer & { close(): Promise<void> } = createPuniContainer(),
): Promise<void> {
  let failure: { readonly caught: unknown } | undefined;
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
      select,
    );
  } catch (caught) {
    failure = { caught };
  }
  try {
    await container.close();
  } catch (closing) {
    if (failure === undefined) throw closing;
    throw new AggregateError(
      [failure.caught, closing],
      'the command failed, then closing its services failed',
      { cause: closing },
    );
  }
  if (failure !== undefined) throw failure.caught;
}
