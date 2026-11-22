import { remedyDefect } from '@puni/shared-failures';
import { defineException } from 'application-exception';
import { nodeInventoryPath } from './nodes';

/** The details every node inventory defect carries: the `check`-style rule and the inventory path. */
interface InventoryDefect {
  readonly rule: 'ops.inventory';
  readonly path: typeof nodeInventoryPath;
}

/** No node inventory in the records checkout; `file` is its absolute path. */
export const NodeInventoryMissing = defineException({
  tag: 'puni/dash-ops/NodeInventoryMissing',
  message: ({ file }: InventoryDefect & { file: string }) => `${file} is missing`,
});

/** A node inventory that is not valid; `file` is its absolute path. */
export const NodeInventoryInvalid = defineException({
  tag: 'puni/dash-ops/NodeInventoryInvalid',
  message: ({ file, problem }: InventoryDefect & { file: string; problem: string }) =>
    `${file} ${problem}`,
});

/** A role a command needs on exactly one node that no node, or more than one, holds. */
export const NodeRoleNotSingle = defineException({
  tag: 'puni/dash-ops/NodeRoleNotSingle',
  message: ({
    file,
    role,
    holders,
  }: InventoryDefect & { file: string; role: string; holders: readonly string[] }) =>
    `${file} gives the role ${role} to ${holders.length === 0 ? 'no node' : `${String(holders.length)} nodes (${holders.join(', ')})`}; exactly one node must hold it`,
});

/** The inventory defects and their remedies; a feature reports each as one `error:` line. */
export const opsDefects = [
  remedyDefect(
    NodeInventoryMissing,
    () =>
      `add ${nodeInventoryPath} to the records repository: {"nodes": [{"name": "<node>", "ssh": "<alias from your SSH configuration>", "roles": ["k3s-server"]}]}`,
  ),
  remedyDefect(NodeInventoryInvalid, () => `correct ${nodeInventoryPath} as the message says`),
  remedyDefect(
    NodeRoleNotSingle,
    ({ role }) => `give the role ${role} to exactly one node in ${nodeInventoryPath}`,
  ),
] as const;

/** A node name the inventory does not hold: a refused command line. */
export const NodeUnknown = defineException({
  tag: 'puni/dash-ops/NodeUnknown',
  message: ({ name, known }: { name: string; known: readonly string[] }) =>
    known.length === 0
      ? `no node named ${name}; the inventory holds no nodes`
      : `no node named ${name}; the nodes are ${known.join(', ')}`,
});
