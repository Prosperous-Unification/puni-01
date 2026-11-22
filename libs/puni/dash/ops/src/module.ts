import { DiBag } from 'di-bag';
import { createK3sCommand } from './k3s.command';
import { createNodeInventory } from './node-inventory.resource';
import { createNodeShell } from './node-shell.feature';
import { createRemoteShell } from './remote-shell.resource';
import { createSshCommand } from './ssh.command';

/** `puni dash ops`; the host supplies the checkout resources and `processRunner`. */
export const dashOpsModule = DiBag.createBuilder()
  .withServices({ nodeInventory: createNodeInventory, remoteShell: createRemoteShell })
  .withServices({ nodeShell: createNodeShell })
  .withServices({ dashOpsSshCommand: createSshCommand, dashOpsK3sCommand: createK3sCommand })
  .buildModule({
    exportedServiceKeys: ['dashOpsSshCommand', 'dashOpsK3sCommand'],
    moduleLabel: 'puni-dash-ops',
  });
