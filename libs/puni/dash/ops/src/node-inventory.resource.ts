import { join } from 'node:path';
import {
  type CheckoutFiles,
  describeValue,
  isRecord,
  parseJson,
  requireOnlyKeys,
} from '@puni/shared-checkout';
import type { NodeInventoryResource, OpsNode } from './contract';
import {
  NodeInventoryInvalid,
  NodeInventoryMissing,
  NodeRoleNotSingle,
  NodeUnknown,
} from './failures';
import { nodeInventoryPath, nodeNamePattern, rolePattern, sshDestinationPattern } from './nodes';

type Refuse = (problem: string, cause?: unknown) => never;

const nodeKeys = ['name', 'ssh', 'roles'];

function readString(
  value: unknown,
  pattern: RegExp,
  where: string,
  form: string,
  refuse: Refuse,
): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    refuse(`${where} is ${describeValue(value)}; expected ${form}`);
  }
  return value;
}

function readRoles(value: unknown, where: string, refuse: Refuse): readonly string[] {
  if (!Array.isArray(value)) {
    return refuse(
      `${where} is ${describeValue(value)}; expected an array of roles, possibly empty`,
    );
  }
  const roles = value.map((role: unknown, index) =>
    readString(
      role,
      rolePattern,
      `${where}[${String(index)}]`,
      'a role: words of lower-case letters and digits joined by single hyphens',
      refuse,
    ),
  );
  const repeated = roles.find((role, index) => roles.indexOf(role) !== index);
  if (repeated !== undefined) refuse(`${where} repeats ${repeated}; each role appears once`);
  return roles;
}

function readNode(value: unknown, where: string, refuse: Refuse): OpsNode {
  if (!isRecord(value)) return refuse(`${where} is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, nodeKeys, where, refuse);
  return {
    name: readString(
      value['name'],
      nodeNamePattern,
      `${where}.name`,
      'lower-case letters, digits and hyphens, starting with a letter or digit',
      refuse,
    ),
    ssh: readString(
      value['ssh'],
      sshDestinationPattern,
      `${where}.ssh`,
      'an alias from your SSH configuration: one token, no whitespace, not starting with -',
      refuse,
    ),
    roles: readRoles(value['roles'], `${where}.roles`, refuse),
  };
}

/**
 * The nodes the inventory text `text` of `file` lists: exactly `{ "nodes": [...] }`, each node
 * exactly `name` (unique), `ssh` and `roles`.
 *
 * @throws NodeInventoryInvalid naming the file and the first problem, with the node's index.
 */
function parseInventory(text: string, file: string): readonly OpsNode[] {
  const refuse: Refuse = (problem, cause) => {
    const details = { rule: 'ops.inventory', path: nodeInventoryPath, file, problem } as const;
    throw cause === undefined
      ? new NodeInventoryInvalid({ details })
      : new NodeInventoryInvalid({ details, cause });
  };
  const read = parseJson(text);
  if ('problem' in read) return refuse(read.problem, read.cause);
  const parsed = read.value;
  if (!isRecord(parsed)) return refuse('is not a JSON object; expected {"nodes": [...]}');
  requireOnlyKeys(parsed, ['nodes'], 'the inventory', refuse);
  const list = parsed['nodes'];
  if (!Array.isArray(list)) return refuse(`nodes is ${describeValue(list)}; expected an array`);
  const nodes = list.map((value: unknown, index) =>
    readNode(value, `nodes[${String(index)}]`, refuse),
  );
  for (const [index, node] of nodes.entries()) {
    const first = nodes.findIndex((other) => other.name === node.name);
    if (first !== index) {
      refuse(
        `nodes[${String(index)}].name ${node.name} repeats nodes[${String(first)}].name; every name is unique`,
      );
    }
  }
  return nodes;
}

/** The {@link NodeInventoryResource}: the inventory is read and validated on every request. */
export function createNodeInventory(): NodeInventoryResource {
  const read = (files: CheckoutFiles): { file: string; nodes: readonly OpsNode[] } => {
    const file = join(files.root, nodeInventoryPath);
    if (files.describe(nodeInventoryPath) === 'absent') {
      throw new NodeInventoryMissing({
        details: { rule: 'ops.inventory', path: nodeInventoryPath, file },
      });
    }
    return { file, nodes: parseInventory(files.readText(nodeInventoryPath), file) };
  };
  return {
    find(files, name) {
      const { nodes } = read(files);
      const node = nodes.find((candidate) => candidate.name === name);
      if (node === undefined) {
        throw new NodeUnknown({ details: { name, known: nodes.map((known) => known.name) } });
      }
      return node;
    },
    findByRole(files, role) {
      const { file, nodes } = read(files);
      const holders = nodes.filter((node) => node.roles.includes(role));
      const [holder] = holders;
      if (holder === undefined || holders.length > 1) {
        throw new NodeRoleNotSingle({
          details: {
            rule: 'ops.inventory',
            path: nodeInventoryPath,
            file,
            role,
            holders: holders.map((node) => node.name),
          },
        });
      }
      return holder;
    },
  };
}
