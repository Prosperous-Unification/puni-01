import { DiBag } from 'di-bag';
import { createCreateCommand } from './create.command';
import { createExecCommand } from './exec.command';
import { createListCommand } from './list.command';
import { createRemoveCommand } from './remove.command';
import { createResources } from './resources.feature';
import { createResourceWorktrees } from './worktrees.resource';

/** `puni dash resources`; the host supplies `checkoutRegistry`, `git` and `processRunner`. */
export const dashResourcesModule = DiBag.createBuilder()
  .withServices({ resourceWorktrees: createResourceWorktrees })
  .withServices({ resources: createResources })
  .withServices({
    dashResourcesCreateCommand: createCreateCommand,
    dashResourcesListCommand: createListCommand,
    dashResourcesExecCommand: createExecCommand,
    dashResourcesRemoveCommand: createRemoveCommand,
  })
  .buildModule({
    exportedServiceKeys: [
      'dashResourcesCreateCommand',
      'dashResourcesListCommand',
      'dashResourcesExecCommand',
      'dashResourcesRemoveCommand',
    ],
    moduleLabel: 'puni-dash-resources',
  });
