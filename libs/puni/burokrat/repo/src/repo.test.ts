import { describe, expect, test } from 'bun:test';
import {
  checkoutModule,
  formatRegistry,
  readRulesSection,
  renderIndex,
} from '@puni/shared-checkout';
import type { CommandBrief } from '@puni/shared-command';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { RepoInitRequest } from './contract';
import { burokratRepoModule } from './module';

const track = closeAfterEach();

const source = '/opt/demo';
const rules = '## Rules\n\n1. **Keep it.** Exactly as it is.\n';
const sourceTree: MemoryTree = {
  [`${source}/puni.json`]: formatRegistry('system-state', fixtureRemotes),
  [`${source}/AGENTS.md`]: `# demo\n\n## Working here\n\n- Anything.\n\n${rules}`,
};
const here = '/w/shop';
const records = '/w/shop-records';
const commands: readonly CommandBrief[] = [
  { path: 'puni burokrat', brief: 'Judge.' },
  { path: 'puni burokrat check', brief: 'Judge the repository.' },
];

function open(tree: MemoryTree = { ...sourceTree, [here]: { directory: true } }) {
  const host = memoryHost(tree);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, burokratRepoModule])
      .withServices(host.services)
      .withServices({
        commandCatalog: () => ({ list: () => commands }),
        programSource: () => ({ directory: `${source}/apps/puni/cli/src` }),
      })
      .buildContainer(),
  );
  const run = (changes: Partial<RepoInitRequest> = {}) => {
    let stdout = '';
    let stderr = '';
    const code = container.resolve('burokratRepoInitCommand').run(
      { kind: 'repo init', name: 'shop', ...changes },
      {
        cwd: here,
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
  const created = () =>
    [...host.nodes]
      .filter(
        ([path, node]) =>
          !path.startsWith(`${source}/`) && !(typeof node === 'object' && 'directory' in node),
      )
      .map(([path]) => path)
      .sort();
  return { host, run, created };
}

describe('burokrat repo init', () => {
  test('creates the system-state repository here and its records beside it, and says what is next', () => {
    const { host, run, created } = open();
    expect(run()).toEqual({
      code: 0,
      stdout: [
        `created system-state ${here}`,
        `created system-records ${records}`,
        'next: create https://github.com/acme/shop and https://github.com/acme/shop-records (private) on GitHub, then:',
        `  git -C ${here} init`,
        `  git -C ${here} add -A && git -C ${here} commit -m 'Start'`,
        `  git -C ${here} remote add origin https://github.com/acme/shop.git && git -C ${here} push -u origin HEAD`,
        `  git -C ${records} init`,
        `  git -C ${records} add -A && git -C ${records} commit -m 'Start'`,
        `  git -C ${records} remote add origin https://github.com/acme/shop-records.git && git -C ${records} push -u origin HEAD`,
        '',
      ].join('\n'),
      stderr: '',
    });
    const index = renderIndex([], commands);
    expect(created()).toEqual(
      [
        `${here}/.gitignore`,
        `${here}/AGENTS.md`,
        `${here}/CLAUDE.md`,
        `${here}/README.md`,
        `${here}/puni.json`,
        ...[...index.keys()].map((path) => `${here}/${path}`),
        `${records}/.gitignore`,
        `${records}/AGENTS.md`,
        `${records}/CLAUDE.md`,
      ].sort(),
    );
    const text = (path: string) => {
      const node = host.nodes.get(path);
      if (typeof node !== 'string') throw new Error(`${path} is no file`);
      return node;
    };
    expect(text(`${here}/puni.json`)).toBe(
      `${formatRegistry('system-state', {
        'system-state': 'https://github.com/acme/shop',
        'system-records': 'https://github.com/acme/shop-records',
      })}\n`,
    );
    const agents = text(`${here}/AGENTS.md`);
    expect(readRulesSection(agents)).toBe(rules);
    expect(agents).toStartWith('# shop\n');
    expect(agents).toContain('<https://github.com/acme/shop-records>');
    expect(agents).toContain('`../shop-records`');
    expect(agents).not.toContain('{{');
    for (const [path, generated] of index) expect(text(`${here}/${path}`)).toBe(generated);
    expect(text(`${records}/AGENTS.md`)).toStartWith('# shop-records\n\nRecords for `shop`');
    expect(text(`${records}/AGENTS.md`)).not.toContain('{{');
    for (const root of [here, records]) {
      expect(host.nodes.get(`${root}/CLAUDE.md`)).toEqual({ symlink: 'AGENTS.md' });
      expect(text(`${root}/.gitignore`)).toBe('.DS_Store\n.idea/\n');
    }
  });

  test('a directory git already initialised needs no git init; --owner names the owner', () => {
    const { run } = open({ ...sourceTree, [`${here}/.git/HEAD`]: 'ref: refs/heads/main\n' });
    const { code, stdout } = run({ owner: 'other' });
    expect(code).toBe(0);
    expect(stdout).toContain('next: create https://github.com/other/shop and ');
    expect(stdout).not.toContain(`git -C ${here} init`);
    expect(stdout).toContain(`git -C ${records} init`);
  });

  test.each([
    [
      'a file in the directory',
      { ...sourceTree, [`${here}/notes.md`]: 'x' },
      {},
      `error: ${here} holds notes.md; a new repository starts in an empty directory, where only .git may exist\n`,
    ],
    [
      'an existing records directory',
      { ...sourceTree, [here]: { directory: true }, [records]: { directory: true } },
      {},
      `error: ${records} already exists; a new repository goes where nothing is\n`,
    ],
    [
      'a name GitHub refuses',
      { ...sourceTree, [here]: { directory: true } },
      { name: '../x' },
      'error: --name "../x" is refused; expected letters, digits, ".", "_" and "-", not starting with "." nor ending in ".git"\n',
    ],
    [
      'a name ending in .git',
      { ...sourceTree, [here]: { directory: true } },
      { name: 'shop.git' },
      'error: --name "shop.git" is refused; expected letters, digits, ".", "_" and "-", not starting with "." nor ending in ".git"\n',
    ],
    [
      'an owner GitHub refuses',
      { ...sourceTree, [here]: { directory: true } },
      { owner: 'a/b' },
      'error: --owner "a/b" is refused; expected letters, digits and hyphens\n',
    ],
  ] as const)(
    '%s is refused with one error line and exit 2, writing nothing',
    (_name, tree, changes, stderr) => {
      const { host, run } = open(tree);
      const before = new Map(host.nodes);
      expect(run(changes)).toEqual({ code: 2, stdout: '', stderr });
      expect(host.nodes).toEqual(before);
    },
  );

  test('a source AGENTS.md without its rules is defective: exit 1, nothing written', () => {
    const { created, run } = open({
      ...sourceTree,
      [`${source}/AGENTS.md`]: '# demo\n',
      [here]: { directory: true },
    });
    expect(run()).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: ${source}/AGENTS.md has no ## Rules section to copy; fix: run puni from a checkout whose AGENTS.md holds its rules\n`,
    });
    expect(created()).toEqual([]);
  });

  test('a source with no puni.json is defective: exit 1', () => {
    const { run } = open({ [`${source}/AGENTS.md`]: rules, [here]: { directory: true } });
    const outcome = run();
    expect([outcome.code, outcome.stdout]).toEqual([1, '']);
    expect(outcome.stderr).toStartWith(
      `error: no puni.json in ${source}/apps/puni/cli/src or any directory above it; `,
    );
  });
});
