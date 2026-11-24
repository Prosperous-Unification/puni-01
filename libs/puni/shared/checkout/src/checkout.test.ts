import { describe, expect, test } from 'bun:test';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import {
  CheckoutPathRefused,
  CheckoutUnlistable,
  FileUnreadable,
  HeadCommitUnreadable,
  RegistryInvalid,
  StagedTextUnreadable,
} from './failures';
import type { CheckoutFilesResource, ProjectScopeResource } from './contract';
import { checkoutModule } from './module';
import { type CheckScope, repositoryScope } from './ownership';
import { formatRegistry } from './registry';

const track = closeAfterEach();

function openHost(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule])
      .withServices(host.services)
      .buildContainer(),
  );
  return { host, container };
}

type Files = ReturnType<CheckoutFilesResource['open']>;
type Projects = ProjectScopeResource;

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (failure) {
    return failure;
  }
  throw new Error('nothing was thrown');
}

const registry = formatRegistry('system-state', fixtureRemotes);

describe('checkoutRegistry over a memory file system', () => {
  test('an invalid puni.json is RegistryInvalid carrying its rule, path and cause', () => {
    const { container } = openHost({ '/r/puni.json': '{ not json' });
    const failure = caught(() => container.resolve('checkoutRegistry').locate('/r/a'));
    expect(failure).toBeInstanceOf(RegistryInvalid);
    if (!(failure instanceof RegistryInvalid)) return;
    expect(failure._tag).toBe('puni/shared-checkout/RegistryInvalid');
    expect([failure.details.rule, failure.details.path]).toEqual([
      'repository.config',
      'puni.json',
    ]);
    expect(failure.message).toStartWith('/r/puni.json is not valid JSON: ');
    expect(failure.cause).toBeInstanceOf(SyntaxError);
  });

  test('a valid puni.json is found from below as its declared type', () => {
    const { container } = openHost({ '/r/puni.json': registry, '/r/a/b.md': 'x' });
    expect(container.resolve('checkoutRegistry').locate('/r/a').type).toBe('system-state');
  });

  test('a puni.json that cannot be read is FileUnreadable naming it, its cause kept', () => {
    const { container } = openHost({ '/r/puni.json': registry });
    const cause = new Error('EACCES: permission denied');
    const fileSystem = container.resolve('fileSystem');
    const unreadable = DiBag.createBuilder()
      .withInstalledModules([checkoutModule])
      .withServices({
        fileSystem: () => ({
          ...fileSystem,
          readText: () => {
            throw cause;
          },
        }),
        git: () => container.resolve('git'),
      })
      .buildContainer();
    track(unreadable);
    const failure = caught(() => unreadable.resolve('checkoutRegistry').locate('/r'));
    expect(failure).toBeInstanceOf(FileUnreadable);
    expect(failure).toMatchObject({
      message: 'cannot read /r/puni.json: EACCES: permission denied',
      details: { path: '/r/puni.json' },
      cause,
    });
  });
});

describe('checkoutFiles over a memory file system', () => {
  const tree: MemoryTree = {
    '/r/project.json': '{"name":"workspace"}',
    '/r/README.md': 'r',
    '/r/CLAUDE.md': { symlink: 'README.md' },
    '/r/libs/two/project.json': '{"name":"two"}',
    '/r/libs/two/a.md': 'a',
    '/r/libs/two/inner/project.json': '{"name":"inner"}',
    '/r/libs/two/inner/b.md': 'b',
  };

  test('a project scope lists only the regular files it owns, sorted', () => {
    const { container } = openHost(tree);
    const files = container.resolve('checkoutFiles').open('/r', 'system-state');
    const projects = container.resolve('checkoutProjectScope').list(files);
    const two = projects.find((project) => project.name === 'two');
    if (two === undefined) throw new Error('two is not a project');
    const scope: CheckScope = { kind: 'project', project: two, projects };
    expect(files.listVisible(scope)).toEqual(['libs/two/a.md', 'libs/two/project.json']);
    expect(files.listVisibleEntries()).toContainEqual({ path: 'CLAUDE.md', kind: 'symlink' });
  });

  test.each(['../outside.md', '/etc/hostname', 'a/../../x'])('the path %s is refused', (path) => {
    const files = openHost(tree).container.resolve('checkoutFiles').open('/r', 'system-state');
    expect(caught(() => files.readText(path))).toBeInstanceOf(CheckoutPathRefused);
  });

  test('a write outside wiki/index/ is refused and nothing is written', () => {
    const { host, container } = openHost(tree);
    const files = container.resolve('checkoutFiles').open('/r', 'system-state');
    expect(
      caught(() => {
        files.write('README.md', 'overwritten');
      }),
    ).toBeInstanceOf(CheckoutPathRefused);
    expect(host.nodes.get('/r/README.md')).toBe('r');
    files.write('wiki/index/index.md', 'generated');
    expect(host.nodes.get('/r/wiki/index/index.md')).toBe('generated');
  });

  test.each([
    ['nav/plans/2031-04-05-a.md', true],
    ['bur/archive/2031-04-05-a.md', true],
    ['bur/findings/2031-04-05-a.md', true],
    ['bur/assessment-reviews/2031-04-05-a.md', true],
    ['nav/plans/deep/2031-04-05-a.md', false],
    ['nav/plans', false],
    ['nav/other/a.md', false],
    ['dash/ops/nodes.json', false],
    ['wiki/index/index.md', false],
    ['AGENTS.md', false],
  ] as const)('a records checkout writes %s: %p', (path, allowed) => {
    const { host, container } = openHost({ '/r/AGENTS.md': 'a' });
    const files = container.resolve('checkoutFiles').open('/r', 'system-records');
    const write = () => {
      files.write(path, 'written');
    };
    if (allowed) {
      write();
      expect(host.nodes.get(`/r/${path}`)).toBe('written');
      return;
    }
    expect(caught(write)).toMatchObject({
      message: `${path}: is not directly inside a kind directory (nav/plans, nav/research, bur/adr, bur/assessments, bur/findings, bur/assessment-reviews, bur/archive), the only place a system-records checkout writes`,
    });
    expect(host.nodes.get(`/r/${path}`)).toBe(path === 'AGENTS.md' ? 'a' : undefined);
  });

  test('a records checkout empties no directory, and a state checkout writes no record', () => {
    const { container } = openHost(tree);
    const records = container.resolve('checkoutFiles').open('/r', 'system-records');
    expect(
      caught(() => {
        records.removeEmptyDirectories('nav/plans');
      }),
    ).toBeInstanceOf(CheckoutPathRefused);
    const state = container.resolve('checkoutFiles').open('/r', 'system-state');
    expect(
      caught(() => {
        state.write('nav/plans/2031-04-05-a.md', 'x');
      }),
    ).toMatchObject({
      message:
        'nav/plans/2031-04-05-a.md: is not inside wiki/index/, the only place a system-state checkout writes',
    });
  });

  test('the HEAD commit is read from git; none is the repository.git defect', () => {
    const { container } = openHost(tree, { heads: { '/r': 'abc1234' } });
    const checkoutFiles = container.resolve('checkoutFiles');
    expect(checkoutFiles.open('/r', 'system-state').readHeadCommit()).toBe('abc1234');
    expect(checkoutFiles.open('/r', 'system-state').root).toBe('/r');
    const failure = caught(() =>
      openHost(tree).container.resolve('checkoutFiles').open('/r', 'system-state').readHeadCommit(),
    );
    expect(failure).toBeInstanceOf(HeadCommitUnreadable);
    expect(failure).toMatchObject({
      message: 'the HEAD commit of /r cannot be read: /r has no commit',
      details: { rule: 'repository.git', path: '.' },
    });
  });

  test('a checkout asks git once; a new checkout sees later files', () => {
    const { host, container } = openHost(tree);
    const checkoutFiles = container.resolve('checkoutFiles');
    const files = checkoutFiles.open('/r', 'system-state');
    const before = files.listVisible({ kind: 'repository' });
    host.nodes.set('/r/later.md', 'later');
    expect(files.listVisible({ kind: 'repository' })).toEqual(before);
    expect(checkoutFiles.open('/r', 'system-state').listVisible({ kind: 'repository' })).toContain(
      'later.md',
    );
  });

  test.each([
    ['listVisible', (files: Files) => files.listVisible(repositoryScope)],
    ['listVisibleEntries', (files: Files) => files.listVisibleEntries()],
    ['the project listing', (files: Files, projects: Projects) => projects.list(files)],
  ] as const)('a git failure makes %s throw the one repository.git defect', (_name, list) => {
    const { container } = openHost(tree, { gitFailure: 'git exploded' });
    const files = container.resolve('checkoutFiles').open('/r', 'system-state');
    const failure = caught(() => list(files, container.resolve('checkoutProjectScope')));
    expect(failure).toBeInstanceOf(CheckoutUnlistable);
    expect(failure).toMatchObject({
      message: 'git exploded',
      details: { rule: 'repository.git', path: '.' },
    });
  });

  test('a file that cannot be read is FileUnreadable naming its repository path', () => {
    const files = openHost({ '/r/docs': { directory: true } })
      .container.resolve('checkoutFiles')
      .open('/r', 'system-state');
    const failure = caught(() => files.readText('docs'));
    expect(failure).toBeInstanceOf(FileUnreadable);
    expect(failure).toMatchObject({ message: 'cannot read docs: EISDIR: /r/docs' });
  });

  test('a path below a file is absent, and exists never throws', () => {
    const files = openHost(tree).container.resolve('checkoutFiles').open('/r', 'system-state');
    expect(files.describe('README.md/below')).toBe('absent');
    expect(files.exists('README.md/below')).toBe(false);
    expect(files.exists('CLAUDE.md')).toBe(true);
  });
});

describe('the staged view of a checkout', () => {
  test('lists and reads what the index holds, and writes nothing', () => {
    const { container } = openHost(
      { '/r/a.md': 'working tree', '/r/b.md': 'unstaged' },
      { staged: { '/r/a.md': 'index' } },
    );
    const staged = container.resolve('checkoutFiles').openStaged('/r');
    expect(staged.listVisible(repositoryScope)).toEqual(['a.md']);
    expect(staged.readText('a.md')).toBe('index');
    expect(caught(() => staged.readText('b.md'))).toBeInstanceOf(StagedTextUnreadable);
    expect(
      caught(() => {
        staged.write('wiki/index/index.md', 'x');
      }),
    ).toBeInstanceOf(CheckoutPathRefused);
    expect(caught(() => staged.createFile('wiki/index/local.md', 'x'))).toBeInstanceOf(
      CheckoutPathRefused,
    );
  });
});
