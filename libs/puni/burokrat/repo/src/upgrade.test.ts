import { describe, expect, test } from 'bun:test';
import { checkoutModule, formatRegistry, type LatestRules } from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { burokratRepoModule } from './module';

const track = closeAfterEach();

const source = '/opt/puni';
const latestText = '## Rules\n\n1. **Keep it.** The latest rules.\n';
const oldText = '## Rules\n\n1. **Keep it.** The first rules.\n';
const here = '/w/shop';
const agents = (section: string) => `# shop\n\n## Working here\n\n- Anything.\n\n${section}`;
const registry = (rules: number) =>
  `${JSON.stringify(JSON.parse(formatRegistry('system-state', fixtureRemotes, rules)), null, 2)}\n`;

const later: Finding = {
  rule: 'demo.later',
  path: 'later.md',
  message: 'exists',
  remedy: 'remove later.md',
};

/** A repository at `/w/shop` pinned at `pin`, upgraded by latest rules of epoch 2 that find `findings`. */
function open({
  pin = 1,
  findings = [],
  tree = {},
}: { pin?: number; findings?: readonly Finding[]; tree?: MemoryTree } = {}) {
  const judged: { cwd: string; rules: string }[] = [];
  const latestRules: LatestRules = {
    epoch: 2,
    judge(cwd, rules) {
      judged.push({ cwd, rules });
      return findings;
    },
  };
  const host = memoryHost({
    [`${source}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 2),
    [`${source}/AGENTS.md`]: agents(latestText),
    [`${here}/puni.json`]: registry(pin),
    [`${here}/AGENTS.md`]: agents(oldText),
    ...tree,
  });
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, burokratRepoModule])
      .withServices(host.services)
      .withServices({
        commandCatalog: () => ({ list: () => [] }),
        programSource: () => ({ directory: `${source}/apps/puni/cli/src`, version: '9.8.7' }),
        latestRules: () => latestRules,
      })
      .buildContainer(),
  );
  const run = () => {
    let stdout = '';
    let stderr = '';
    const code = container.resolve('burokratRepoUpgradeCommand').run(
      { kind: 'repo upgrade' },
      {
        cwd: `${here}/deep`,
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    return { code, stdout, stderr };
  };
  const file = (path: string) => host.nodes.get(`${here}/${path}`);
  return { host, run, file, judged };
}

describe('burokrat repo upgrade', () => {
  test('with no findings at the latest epoch it repins puni.json, rewrites the rules and says so', () => {
    const { run, file, judged } = open({ tree: { [`${here}/deep`]: { directory: true } } });
    expect(run()).toEqual({ code: 0, stdout: 'upgraded: rules epoch 1 -> 2\n', stderr: '' });
    expect(judged).toEqual([{ cwd: `${here}/deep`, rules: latestText }]);
    expect(file('puni.json')).toBe(registry(2));
    expect(file('AGENTS.md')).toBe(agents(latestText));
  });

  test('with findings it prints them, changes nothing and exits 1', () => {
    const { host, run } = open({
      findings: [later],
      tree: { [`${here}/deep`]: { directory: true } },
    });
    const before = new Map(host.nodes);
    expect(run()).toEqual({
      code: 1,
      stdout:
        'demo.later later.md: exists; fix: remove later.md\nfail: rules epoch 2, 1 finding; puni.json stays at epoch 1.\n',
      stderr: '',
    });
    expect(host.nodes).toEqual(before);
  });

  test('at the latest epoch it says so, judges nothing and exits 0', () => {
    const { host, run, judged } = open({ pin: 2, tree: { [`${here}/deep`]: { directory: true } } });
    const before = new Map(host.nodes);
    expect(run()).toEqual({
      code: 0,
      stdout: 'ok: rules epoch 2 is already the latest this puni knows\n',
      stderr: '',
    });
    expect([judged, host.nodes]).toEqual([[], before]);
  });

  test('a pin past the latest epoch is refused naming both and the version, exit 2', () => {
    const { run } = open({ pin: 5, tree: { [`${here}/deep`]: { directory: true } } });
    expect(run()).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: puni.json pins rules epoch 5, but puni 9.8.7 knows rules only up to epoch 2; upgrade puni\n',
    });
  });

  test.each([
    [
      'a source AGENTS.md without its rules',
      { [`${source}/AGENTS.md`]: '# puni\n' },
      `error: ${source}/AGENTS.md has no ## Rules section to copy\n`,
    ],
    [
      'an AGENTS.md here without its rules',
      { [`${here}/AGENTS.md`]: '# shop\n' },
      `error: ${here}/AGENTS.md has no ## Rules section to rewrite\n`,
    ],
  ] as const)('%s is defective: exit 1, nothing written', (_name, tree, stderr) => {
    const { host, run } = open({ tree: { ...tree, [`${here}/deep`]: { directory: true } } });
    const before = new Map(host.nodes);
    expect(run()).toEqual({ code: 1, stdout: '', stderr });
    expect(host.nodes).toEqual(before);
  });

  test('no puni.json above the directory is defective: exit 1', () => {
    const { host, run } = open({ tree: { [`${here}/deep`]: { directory: true } } });
    host.nodes.delete(`${here}/puni.json`);
    const outcome = run();
    expect([outcome.code, outcome.stdout]).toEqual([1, '']);
    expect(outcome.stderr).toStartWith(
      `error: no puni.json in ${here}/deep or any directory above it; `,
    );
  });
});
