import { describe, expect, test } from 'bun:test';
import {
  checkoutModule,
  formatRegistry,
  type LatestRules,
  type RepositoryType,
  type UpgradeTexts,
} from '@puni/shared-checkout';
import type { Finding } from '@puni/shared-failures';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { burokratRepoModule } from './module';

const track = closeAfterEach();

const source = '/opt/puni';
const latestText = '## Rules\n\n1. **Keep it.** The latest rules.\n';
const oldText = '## Rules\n\n1. **Keep it.** The first rules.\n';
const here = '/w/shop';
const agents = (section: string, after = '') =>
  `# shop\n\n## Working here\n\n- Anything.\n\n${section}${after}`;
const registry = (rules: number) =>
  `${JSON.stringify(JSON.parse(formatRegistry('system-state', fixtureRemotes, rules)), null, 2)}\n`;

const later = (rule: string): Finding => ({
  rule,
  path: 'later.md',
  message: 'exists',
  remedy: 'remove later.md',
});

type Judged = Readonly<Record<RepositoryType, readonly Finding[]>>;

/** The records checkout beside `/w/shop`, as its registry names it. */
const records = '/w/demo-records';

/**
 * A repository at `/w/shop` pinned at `pin`, its `AGENTS.md` holding `target`, upgraded by
 * latest rules of `epoch` (2 unless given) that find `findings` and whose rules text is
 * `latestText`.
 */
function open({
  pin = 1,
  epoch = 2,
  findings = { 'system-state': [], 'system-records': [] },
  target = agents(oldText),
  tree = {},
}: {
  pin?: number;
  epoch?: number;
  findings?: Judged;
  target?: string;
  tree?: MemoryTree;
} = {}) {
  const judged: { cwd: string; texts: UpgradeTexts }[] = [];
  const latestRules: LatestRules = {
    epoch,
    judge(cwd, texts) {
      judged.push({ cwd, texts });
      return findings;
    },
    holdsRulesOf: (section, at) => section === latestText && at === epoch,
  };
  const host = memoryHost({
    [`${source}/puni.json`]: formatRegistry('system-state', fixtureRemotes, epoch),
    [`${source}/AGENTS.md`]: agents(latestText),
    [`${here}/puni.json`]: registry(pin),
    [`${here}/AGENTS.md`]: target,
    [`${here}/deep`]: { directory: true },
    ...tree,
  });
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, burokratRepoModule])
      .withServices(host.services)
      .withServices({
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
  const file = (path: string, root = here) => host.nodes.get(`${root}/${path}`);
  return { host, run, file, judged };
}

describe('burokrat repo upgrade', () => {
  test('with no findings at the latest epoch it rewrites the rules, repins puni.json and says so', () => {
    const { run, file, judged } = open();
    expect(run()).toEqual({ code: 0, stdout: 'upgraded: rules epoch 1 -> 2\n', stderr: '' });
    expect(judged).toEqual([
      {
        cwd: `${here}/deep`,
        texts: { 'system-state': { 'AGENTS.md': agents(latestText) }, 'system-records': {} },
      },
    ]);
    expect(file('puni.json')).toBe(registry(2));
    expect(file('AGENTS.md')).toBe(agents(latestText));
  });

  test('a source section that ends its file goes mid-file with one blank line before the next heading', () => {
    const { run, file } = open({ target: agents(`${oldText}\n\n\n`, '## Later\n\nkept\n') });
    expect(run().code).toBe(0);
    expect(file('AGENTS.md')).toBe(agents(`${latestText}\n`, '## Later\n\nkept\n'));
  });

  test('with findings in either repository it prints each, changes nothing and exits 1', () => {
    const { host, run } = open({
      findings: {
        'system-state': [later('demo.a'), later('demo.b')],
        'system-records': [later('demo.c')],
      },
    });
    const before = new Map(host.nodes);
    expect(run()).toEqual({
      code: 1,
      stdout: [
        'demo.a later.md: exists; fix: remove later.md',
        'demo.b later.md: exists; fix: remove later.md',
        'fail: system-state at rules epoch 2, 2 findings.',
        'demo.c later.md: exists; fix: remove later.md',
        'fail: system-records at rules epoch 2, 1 finding.',
        'puni.json stays at rules epoch 1.',
        '',
      ].join('\n'),
      stderr: '',
    });
    expect(host.nodes).toEqual(before);
  });

  test('findings only in the records repository still refuse the upgrade', () => {
    const { run, file } = open({
      findings: { 'system-state': [], 'system-records': [later('demo.c')] },
    });
    expect(run().stdout).toBe(
      'demo.c later.md: exists; fix: remove later.md\nfail: system-records at rules epoch 2, 1 finding.\npuni.json stays at rules epoch 1.\n',
    );
    expect(file('puni.json')).toBe(registry(1));
  });

  test('at the latest epoch it says so, judges nothing and exits 0', () => {
    const { host, run, judged } = open({ pin: 2 });
    const before = new Map(host.nodes);
    expect(run()).toEqual({
      code: 0,
      stdout: 'ok: rules epoch 2 is already the latest this puni knows\n',
      stderr: '',
    });
    expect([judged, host.nodes]).toEqual([[], before]);
  });

  test.each([
    [
      'a pin past the latest epoch',
      { pin: 5 },
      'error: puni.json pins rules epoch 5, but puni 9.8.7 knows rules only up to epoch 2; upgrade puni\n',
    ],
    [
      'a source holding the rules of an older epoch',
      { tree: { [`${source}/AGENTS.md`]: agents(oldText) } },
      `error: the checkout puni runs from holds the rules of an older epoch than 2 in ${source}/AGENTS.md; run puni from a checkout that holds the rules of epoch 2\n`,
    ],
  ] as const)('%s is refused: exit 2, nothing judged or written', (_name, options, stderr) => {
    const { host, run, judged } = open(options);
    const before = new Map(host.nodes);
    expect(run()).toEqual({ code: 2, stdout: '', stderr });
    expect([judged, host.nodes]).toEqual([[], before]);
  });

  test.each([
    [
      'a source AGENTS.md without its rules',
      { tree: { [`${source}/AGENTS.md`]: '# puni\n' } },
      `error: ${source}/AGENTS.md has no ## Rules section to copy\n`,
    ],
    [
      'an AGENTS.md here without its rules',
      { target: '# shop\n' },
      `error: ${here}/AGENTS.md has no ## Rules section to rewrite\n`,
    ],
  ] as const)(
    '%s is defective before judging: exit 1, nothing written',
    (_name, options, stderr) => {
      const { host, run, judged } = open(options);
      const before = new Map(host.nodes);
      expect(run()).toEqual({ code: 1, stdout: '', stderr });
      expect([judged, host.nodes]).toEqual([[], before]);
    },
  );

  test('raised to epoch 4 it opens each entry file declaring no type with its front matter', () => {
    const readme = '---\ntitle: Shop\n---\n\n# shop\n';
    const { run, file, judged } = open({
      pin: 3,
      epoch: 4,
      tree: {
        [`${here}/README.md`]: readme,
        [`${records}/AGENTS.md`]: '# demo-records\n',
        [`${records}/.git`]: { directory: true },
      },
    });
    expect(run()).toEqual({ code: 0, stdout: 'upgraded: rules epoch 3 -> 4\n', stderr: '' });
    const declared = {
      'system-state': {
        'AGENTS.md': `---\npuni-doc-type: agents\n---\n\n${agents(latestText)}`,
        'README.md': '---\npuni-doc-type: readme\ntitle: Shop\n---\n\n# shop\n',
      },
      'system-records': { 'AGENTS.md': '---\npuni-doc-type: agents\n---\n\n# demo-records\n' },
    };
    expect(judged.map(({ texts }) => texts)).toEqual([declared]);
    expect([file('AGENTS.md'), file('README.md'), file('AGENTS.md', records)]).toEqual([
      declared['system-state']['AGENTS.md'],
      declared['system-state']['README.md'],
      declared['system-records']['AGENTS.md'],
    ]);
  });

  test('raised to epoch 4 it leaves an entry file that declares a type, and a missing one, alone', () => {
    const typed = `---\npuni-doc-type: agents\n---\n\n${agents(oldText)}`;
    const { run, file, judged } = open({
      pin: 3,
      epoch: 4,
      target: typed,
      tree: { [`${records}/AGENTS.md`]: '---\npuni-doc-type: agents\n---\n\n# r\n' },
    });
    expect(run().code).toBe(0);
    expect(judged.map(({ texts }) => texts)).toEqual([
      {
        'system-state': { 'AGENTS.md': `---\npuni-doc-type: agents\n---\n\n${agents(latestText)}` },
        'system-records': {},
      },
    ]);
    expect([file('README.md'), file('AGENTS.md', records)]).toEqual([
      undefined,
      '---\npuni-doc-type: agents\n---\n\n# r\n',
    ]);
  });

  test('raised to epoch 4 with no records checkout beside it, it declares the state files and judges', () => {
    const { run, judged } = open({
      pin: 3,
      epoch: 4,
      findings: { 'system-state': [], 'system-records': [later('repository.checkout')] },
    });
    expect(run().code).toBe(1);
    expect(judged.map(({ texts }) => texts['system-records'])).toEqual([{}]);
  });

  test('raised from 1 to 2 it declares no type: types start at epoch 4', () => {
    const { run, file } = open({ tree: { [`${here}/README.md`]: '# shop\n' } });
    expect(run().code).toBe(0);
    expect(file('README.md')).toBe('# shop\n');
  });

  test('no puni.json above the directory is defective: exit 1', () => {
    const { host, run } = open();
    host.nodes.delete(`${here}/puni.json`);
    const outcome = run();
    expect([outcome.code, outcome.stdout]).toEqual([1, '']);
    expect(outcome.stderr).toStartWith(
      `error: no puni.json in ${here}/deep or any directory above it; `,
    );
  });
});
