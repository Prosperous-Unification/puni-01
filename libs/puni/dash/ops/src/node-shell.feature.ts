import {
  type CheckoutFiles,
  type CheckoutFilesResource,
  checkoutDefects,
  FileUnreadable,
  type RepositoryRegistryResource,
} from '@puni/shared-checkout';
import { findDefect } from '@puni/shared-failures';
import type {
  NodeInventoryResource,
  NodeShell,
  NodeShellOutcome,
  OpsNode,
  RemoteShellResource,
} from './contract';
import { NodeUnknown, opsDefects } from './failures';
import { k3sServerRole } from './nodes';

/**
 * The {@link NodeShell}. The records checkout is the `system-records` repository beside the one
 * holding the nearest `puni.json`; its inventory names the node and the SSH alias that reaches
 * it. Once `ssh` is asked to start, its outcome is returned as it is. Before that, a node the
 * inventory does not hold is `refused`; a registry or records checkout that cannot be found, an
 * inventory that is missing, unreadable or invalid, or a role not held by exactly one node is
 * `defective`, its reason ending in `; fix: <remedy>`. Anything else propagates.
 */
export function createNodeShell({
  checkoutRegistry,
  checkoutFiles,
  nodeInventory,
  remoteShell,
}: {
  checkoutRegistry: RepositoryRegistryResource;
  checkoutFiles: CheckoutFilesResource;
  nodeInventory: NodeInventoryResource;
  remoteShell: RemoteShellResource;
}): NodeShell {
  const runOn = (
    cwd: string,
    select: (records: CheckoutFiles) => OpsNode,
    command: readonly string[],
  ): NodeShellOutcome => {
    let node;
    try {
      const records = checkoutRegistry.resolve(checkoutRegistry.locate(cwd), 'system-records');
      node = select(checkoutFiles.open(records.root, records.type));
    } catch (caught) {
      if (caught instanceof NodeUnknown) return { kind: 'refused', reason: caught.message };
      if (caught instanceof FileUnreadable) return { kind: 'defective', reason: caught.message };
      const defect = findDefect(caught, [...checkoutDefects, ...opsDefects]);
      if (defect === undefined) throw caught;
      return { kind: 'defective', reason: `${defect.message}; fix: ${defect.remedy}` };
    }
    return remoteShell.run(node.ssh, command, cwd);
  };
  return {
    open: (cwd, name, command) => runOn(cwd, (files) => nodeInventory.find(files, name), command),
    runKubectl: (cwd, args) =>
      runOn(cwd, (files) => nodeInventory.findByRole(files, k3sServerRole), [
        'k3s',
        'kubectl',
        ...args,
      ]),
  };
}
