import { explainDefect, type RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Resources, ResourcesOutcome, ResourceWorktreesResource } from './contract';
import {
  ResourceExists,
  ResourceGitFailed,
  ResourceNameRefused,
  ResourceNotDisposable,
  ResourceUnknown,
} from './failures';

/**
 * The {@link Resources}. The system-state repository is the one the nearest `puni.json` at or
 * above `cwd` names, and its resources live under its main worktree, so a command run inside a
 * resource sees the same resources. A refused name, a taken name or branch, an unknown resource,
 * a removal that would lose work and an empty command are `refused`; a registry or checkout that
 * cannot be found, and git failing, are `failed`, a defect's reason ending in `; fix: <remedy>`.
 * Anything else propagates.
 */
export function createResources({
  checkoutRegistry,
  resourceWorktrees,
}: {
  checkoutRegistry: RepositoryRegistryResource;
  resourceWorktrees: ResourceWorktreesResource;
}): Resources {
  const inMain = <Done>(cwd: string, work: (main: string) => Done): ResourcesOutcome<Done> => {
    try {
      const state = checkoutRegistry.resolve(checkoutRegistry.locate(cwd), 'system-state');
      return { kind: 'done', done: work(resourceWorktrees.findMain(state.root)) };
    } catch (caught) {
      if (
        caught instanceof ResourceNameRefused ||
        caught instanceof ResourceExists ||
        caught instanceof ResourceUnknown ||
        caught instanceof ResourceNotDisposable
      ) {
        return { kind: 'refused', reason: caught.message };
      }
      if (caught instanceof ResourceGitFailed) return { kind: 'failed', reason: caught.message };
      const reason = explainDefect(caught);
      if (reason === undefined) throw caught;
      return { kind: 'failed', reason };
    }
  };
  return {
    create: (cwd, name, from) => inMain(cwd, (main) => resourceWorktrees.create(main, name, from)),
    list: (cwd) => inMain(cwd, (main) => resourceWorktrees.list(main)),
    exec(cwd, name, command) {
      if (command.length === 0) {
        return { kind: 'refused', reason: `give the command to run in resource ${name}` };
      }
      return inMain(cwd, (main) =>
        resourceWorktrees.run(resourceWorktrees.find(main, name).path, command),
      );
    },
    remove: (cwd, name, force) =>
      inMain(cwd, (main) => resourceWorktrees.remove(main, name, force)),
  };
}
