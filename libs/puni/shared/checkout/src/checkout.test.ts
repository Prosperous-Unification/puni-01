import { afterEach, describe, expect, test } from 'bun:test';
import { type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { CheckoutPathRefused, ProjectsUnlistable, RegistryInvalid } from './failures';
import { checkoutModule } from './module';
import type { CheckScope } from './ownership';

const containers: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const container of containers.splice(0)) await container.close();
});

function openHost(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const host = memoryHost(tree, options);
  const container = DiBag.createBuilder()
    .withInstalledModules([checkoutModule])
    .withServices(host.services)
    .buildContainer();
  containers.push(container);
  return { host, container };
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (failure) {
    return failure;
  }
  throw new Error('nothing was thrown');
}

const registry = JSON.stringify({
  'this-repo-type': 'system-state',
  'all-repos': [
    { type: 'system-state', remote: { type: 'github', url: 'https://github.com/acme/demo' } },
    {
      type: 'system-records',
      remote: { type: 'github', url: 'https://github.com/acme/demo-records' },
    },
  ],
});

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
    const files = container.resolve('checkoutFiles').open('/r');
    const projects = container.resolve('checkoutProjectScope').list(files);
    const two = projects.find((project) => project.name === 'two');
    if (two === undefined) throw new Error('two is not a project');
    const scope: CheckScope = { kind: 'project', project: two, projects };
    expect(files.listVisible(scope)).toEqual({ files: ['libs/two/a.md', 'libs/two/project.json'] });
    expect(files.listVisibleEntries()).toMatchObject({
      entries: expect.arrayContaining([{ path: 'CLAUDE.md', kind: 'symlink' }]) as unknown,
    });
  });

  test.each(['../outside.md', '/etc/hostname', 'a/../../x'])('the path %s is refused', (path) => {
    const files = openHost(tree).container.resolve('checkoutFiles').open('/r');
    expect(caught(() => files.readText(path))).toBeInstanceOf(CheckoutPathRefused);
  });

  test('a write outside wiki/index/ is refused and nothing is written', () => {
    const { host, container } = openHost(tree);
    const files = container.resolve('checkoutFiles').open('/r');
    expect(
      caught(() => {
        files.write('README.md', 'overwritten');
      }),
    ).toBeInstanceOf(CheckoutPathRefused);
    expect(host.nodes.get('/r/README.md')).toBe('r');
    files.write('wiki/index/index.md', 'generated');
    expect(host.nodes.get('/r/wiki/index/index.md')).toBe('generated');
  });

  test('a git failure makes the projects unlistable, a repository.projects defect', () => {
    const { container } = openHost(tree, { gitFailure: 'git exploded' });
    const files = container.resolve('checkoutFiles').open('/r');
    const failure = caught(() => container.resolve('checkoutProjectScope').list(files));
    expect(failure).toBeInstanceOf(ProjectsUnlistable);
    expect(failure).toMatchObject({
      message: 'git exploded',
      details: { rule: 'repository.projects', path: '.' },
    });
  });
});
