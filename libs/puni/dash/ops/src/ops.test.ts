import { describe, expect, test } from 'bun:test';
import { checkoutModule, formatRegistry } from '@puni/shared-checkout';
import type { Io } from '@puni/shared-command';
import {
  closeAfterEach,
  fixtureRemotes,
  type MemoryHost,
  type MemoryTree,
  memoryHost,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { dashOpsModule } from './module';

const track = closeAfterEach();

const state = '/w/demo';
const inventory = '/w/demo-records/dash/ops/nodes.json';
const fix = 'fix: correct dash/ops/nodes.json as the message says';

const nodes = {
  nodes: [
    { name: 'alpha', ssh: 'alpha-alias', roles: ['k3s-server'] },
    { name: 'beta-2', ssh: 'beta.example', roles: [] },
  ],
};

function pair(inventoryText?: string): MemoryTree {
  return {
    [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 1),
    '/w/demo-records/AGENTS.md': '# records\n',
    ...(inventoryText === undefined ? {} : { [inventory]: inventoryText }),
  };
}

interface Run {
  readonly code: number;
  readonly stderr: string;
  readonly attached: readonly (readonly string[])[];
}

function open(tree: MemoryTree, attached: Readonly<Record<string, number>> = {}) {
  const host: MemoryHost = memoryHost(tree, { attached });
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, dashOpsModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const run = (execute: (io: Io) => number, cwd = state): Run => {
    let stderr = '';
    const io: Io = {
      cwd,
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
    };
    const code = execute(io);
    return { code, stderr, attached: host.attachedRuns };
  };
  return {
    ssh: (node: string, command: readonly string[] = [], cwd?: string) =>
      run(
        (io) => container.resolve('dashOpsSshCommand').run({ kind: 'ops ssh', node, command }, io),
        cwd,
      ),
    k3s: (args: readonly string[]) =>
      run((io) => container.resolve('dashOpsK3sCommand').run({ kind: 'ops k3s', args }, io)),
  };
}

const valid = JSON.stringify(nodes);

describe('ops ssh', () => {
  test('a node with no command is an interactive ssh to its alias, from a nested directory', () => {
    expect(open(pair(valid), { 'ssh alpha-alias': 0 }).ssh('alpha', [], `${state}/sub`)).toEqual({
      code: 0,
      stderr: '',
      attached: [['ssh', 'alpha-alias']],
    });
  });

  test('a command is passed after --, each argument quoted', () => {
    const vector = ['ssh', 'beta.example', '--', "'sh'", "'-c'", "'exit 7'"];
    expect(
      open(pair(valid), { [vector.join(' ')]: 7 }).ssh('beta-2', ['sh', '-c', 'exit 7']),
    ).toEqual({
      code: 7,
      stderr: '',
      attached: [vector],
    });
  });

  test.each([0, 1, 127, 255])('the remote exit code %i is returned unchanged', (exitCode) => {
    const vector = ['ssh', 'alpha-alias', '--', "'true'"];
    expect(open(pair(valid), { [vector.join(' ')]: exitCode }).ssh('alpha', ['true']).code).toBe(
      exitCode,
    );
  });

  test('an ssh that cannot start is one error line and exit 1', () => {
    expect(open(pair(valid)).ssh('alpha')).toEqual({
      code: 1,
      stderr: 'error: ssh could not start: ssh alpha-alias is not in the memory host\n',
      attached: [['ssh', 'alpha-alias']],
    });
  });

  test('an unknown node is refused with exit 2, listing the known names', () => {
    expect(open(pair(valid)).ssh('nope')).toEqual({
      code: 2,
      stderr: 'error: no node named nope; the nodes are alpha, beta-2\n',
      attached: [],
    });
    expect(open(pair('{"nodes": []}')).ssh('nope').stderr).toBe(
      'error: no node named nope; the inventory holds no nodes\n',
    );
  });
});

describe('the node inventory', () => {
  const node = (fields: Record<string, unknown>) =>
    JSON.stringify({ nodes: [{ name: 'alpha', ssh: 'alpha-alias', roles: [], ...fields }] });

  test.each([
    ['{ not json', /^is not valid JSON: /u],
    ['[]', 'is not a JSON object; expected {"nodes": [...]}'],
    ['{"nodes": [], "hosts": []}', 'the inventory has unknown keys hosts; it holds only nodes'],
    ['{}', 'nodes is missing; expected an array'],
    ['{"nodes": {}}', 'nodes is {}; expected an array'],
    ['{"nodes": ["alpha"]}', 'nodes[0] is "alpha"; expected an object'],
    [node({ address: 'x' }), 'nodes[0] has unknown keys address; it holds only name, ssh, roles'],
    [
      node({ name: undefined }),
      'nodes[0].name is missing; expected lower-case letters, digits and hyphens, starting with a letter or digit',
    ],
    [
      node({ name: 'Alpha' }),
      'nodes[0].name is "Alpha"; expected lower-case letters, digits and hyphens, starting with a letter or digit',
    ],
    [
      node({ name: '-alpha' }),
      'nodes[0].name is "-alpha"; expected lower-case letters, digits and hyphens, starting with a letter or digit',
    ],
    [
      node({ ssh: '-oProxyCommand=x' }),
      'nodes[0].ssh is "-oProxyCommand=x"; expected an alias from your SSH configuration: one token, no whitespace, not starting with -',
    ],
    [
      node({ ssh: 'alpha alias' }),
      'nodes[0].ssh is "alpha alias"; expected an alias from your SSH configuration: one token, no whitespace, not starting with -',
    ],
    [
      node({ ssh: 22 }),
      'nodes[0].ssh is 22; expected an alias from your SSH configuration: one token, no whitespace, not starting with -',
    ],
    [
      node({ roles: 'k3s-server' }),
      'nodes[0].roles is "k3s-server"; expected an array of roles, possibly empty',
    ],
    [
      node({ roles: ['K3s'] }),
      'nodes[0].roles[0] is "K3s"; expected a role: words of lower-case letters and digits joined by single hyphens',
    ],
    [node({ roles: ['web', 'web'] }), 'nodes[0].roles repeats web; each role appears once'],
    [
      JSON.stringify({ nodes: [nodes.nodes[0], nodes.nodes[0]] }),
      'nodes[1].name alpha repeats nodes[0].name; every name is unique',
    ],
  ] as const)('%s is defective: %s', (text, problem) => {
    const run = open(pair(text)).ssh('alpha');
    expect([run.code, run.attached]).toEqual([1, []]);
    const prefix = `error: ${inventory} `;
    expect(run.stderr.startsWith(prefix) && run.stderr.endsWith(`; ${fix}\n`)).toBe(true);
    const said = run.stderr.slice(prefix.length, -`; ${fix}\n`.length);
    if (typeof problem === 'string') expect(said).toBe(problem);
    else expect(said).toMatch(problem);
  });

  test('a missing inventory is one error line saying how to add it, exit 1', () => {
    expect(open(pair()).ssh('alpha')).toEqual({
      code: 1,
      stderr: `error: ${inventory} is missing; fix: add dash/ops/nodes.json to the records repository: {"nodes": [{"name": "<node>", "ssh": "<alias from your SSH configuration>", "roles": ["k3s-server"]}]}\n`,
      attached: [],
    });
  });

  test('an inventory that cannot be read is one error line naming it, exit 1', () => {
    expect(open({ ...pair(), [inventory]: { directory: true } }).ssh('alpha')).toEqual({
      code: 1,
      stderr: `error: cannot read dash/ops/nodes.json: EISDIR: ${inventory}\n`,
      attached: [],
    });
  });

  test('a missing records checkout is one error line saying where to clone it, exit 1', () => {
    const run = open({
      [`${state}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 1),
    }).ssh('alpha');
    expect(run).toEqual({
      code: 1,
      stderr:
        'error: the system-records repository is not checked out at /w/demo-records; clone https://github.com/acme/demo-records there; fix: clone it: git clone https://github.com/acme/demo-records /w/demo-records\n',
      attached: [],
    });
  });

  test('no puni.json is one error line, exit 1', () => {
    const run = open({}).ssh('alpha', [], '/w');
    expect([run.code, run.attached]).toEqual([1, []]);
    expect(run.stderr).toStartWith('error: no puni.json in /w ');
  });
});

describe('ops k3s', () => {
  test('runs k3s kubectl with the arguments on the k3s server, quoted', () => {
    const vector = [
      'ssh',
      'alpha-alias',
      '--',
      "'k3s'",
      "'kubectl'",
      "'get'",
      "'pods'",
      "'-n'",
      "'kube-system'",
    ];
    expect(
      open(pair(valid), { [vector.join(' ')]: 0 }).k3s(['get', 'pods', '-n', 'kube-system']),
    ).toEqual({
      code: 0,
      stderr: '',
      attached: [vector],
    });
  });

  test.each([
    [[], 'no node'],
    [['alpha', 'beta-2'], '2 nodes (alpha, beta-2)'],
  ] as const)('servers %j: one error line and exit 1', (servers, holders) => {
    const text = JSON.stringify({
      nodes: nodes.nodes.map((entry) => ({
        ...entry,
        roles: (servers as readonly string[]).includes(entry.name) ? ['k3s-server'] : [],
      })),
    });
    expect(open(pair(text)).k3s(['get', 'nodes'])).toEqual({
      code: 1,
      stderr: `error: ${inventory} gives the role k3s-server to ${holders}; exactly one node must hold it; fix: give the role k3s-server to exactly one node in dash/ops/nodes.json\n`,
      attached: [],
    });
  });
});
