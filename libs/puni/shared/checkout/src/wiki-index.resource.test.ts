import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeAfterEach,
  type MemoryTree,
  memoryHost,
  nodeHostModule,
  removeFixture,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { CheckoutUnlistable } from './failures';
import { checkoutModule } from './module';
import { indexFile } from './render-index';

const track = closeAfterEach();

const project = (name: string, readWhen: string, readFirst = 'src/index.ts') =>
  JSON.stringify({ name, metadata: { readWhen, readFirst } });

/** The sources of a valid index: one project under `apps/`, an empty `libs/` and one page. */
const sources: MemoryTree = {
  '/r/apps/one/project.json': project('one', 'changing one'),
  '/r/apps/one/src/index.ts': 'export {};',
  '/r/libs': { directory: true },
  '/r/wiki/deploy.md': '---\ntitle: Deploy\nread-when: deploying\n---\n',
};

function openMemory(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule])
      .withServices(host.services)
      .buildContainer(),
  );
  return {
    host,
    files: container.resolve('checkoutFiles').open('/r', 'system-state'),
    wikiIndex: container.resolve('checkoutWikiIndex'),
  };
}

describe('readSources', () => {
  test('reads each project and page into one entry', () => {
    const { files, wikiIndex } = openMemory(sources);
    expect(wikiIndex.readSources(files)).toEqual({
      entries: [
        { name: 'one', path: 'apps/one/src/index.ts', readWhen: 'changing one' },
        { name: 'Deploy', path: 'wiki/deploy.md', readWhen: 'deploying' },
      ],
      defects: [],
    });
  });

  test.each([
    ['{ not json', /^is not valid JSON: /u],
    ['[]', /^is not a JSON object$/u],
    ['{}', /^has no name$/u],
  ])('a project.json holding %s is one read-when defect', (text, message) => {
    const { files, wikiIndex } = openMemory({ ...sources, '/r/libs/two/project.json': text });
    const { defects } = wikiIndex.readSources(files);
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ topic: 'read-when', path: 'libs/two/project.json' });
    expect(defects[0]?.message).toMatch(message);
  });

  test('a project below node_modules and the generated index are no sources', () => {
    const { files, wikiIndex } = openMemory({
      ...sources,
      '/r/libs/node_modules/x/project.json': '{}',
      [`/r/${indexFile}`]: 'generated',
    });
    expect(wikiIndex.readSources(files).defects).toEqual([]);
  });

  test('a git that cannot list the checkout is the repository.git defect, not a source defect', () => {
    const { files, wikiIndex } = openMemory(sources, { gitFailure: 'git exploded' });
    throws(() => wikiIndex.readSources(files), CheckoutUnlistable);
  });
});

describe('compare and write', () => {
  const expected = new Map([[indexFile, 'fresh']]);

  test('write makes wiki/index exactly what is expected and returns the drift it mended', () => {
    const { host, files, wikiIndex } = openMemory({
      ...sources,
      '/r/wiki/index/old.md': 'old',
      '/r/wiki/index/deep/notes.md': 'notes',
    });
    const drift = {
      missing: [indexFile],
      stale: [],
      unexpected: ['wiki/index/deep/notes.md', 'wiki/index/old.md'],
    };
    expect(wikiIndex.compare(files, expected)).toEqual(drift);
    expect(wikiIndex.write(files, expected)).toEqual(drift);
    expect([...host.nodes.keys()].filter((path) => path.startsWith('/r/wiki/index'))).toEqual([
      `/r/${indexFile}`,
    ]);
  });

  test('a stale file is rewritten', () => {
    const { host, files, wikiIndex } = openMemory({ ...sources, [`/r/${indexFile}`]: 'edited' });
    expect(wikiIndex.write(files, expected)).toEqual({
      missing: [],
      stale: [indexFile],
      unexpected: [],
    });
    expect(host.nodes.get(`/r/${indexFile}`)).toBe('fresh');
  });

  test('a git that cannot list the checkout throws from compare and write', () => {
    const { files, wikiIndex } = openMemory(sources, { gitFailure: 'git exploded' });
    throws(() => wikiIndex.compare(files, expected), CheckoutUnlistable);
    throws(() => wikiIndex.write(files, expected), CheckoutUnlistable);
  });
});

describe('a path git ignores is invisible', () => {
  test('an ignored page, project.json or index file is not read, compared or removed', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'puni-wiki-index-')), 'demo');
    try {
      writeProject(root, 'apps/one', 'one', {
        readWhen: 'changing one',
        readFirst: 'src/index.ts',
      });
      writeRepositoryFile(root, 'libs/.gitkeep', '');
      writeRepositoryFile(
        root,
        '.gitignore',
        'wiki/scratch.md\nlibs/stray/\nwiki/index/local.md\n',
      );
      writeRepositoryFile(root, 'wiki/scratch.md', '# no front matter\n');
      writeRepositoryFile(root, 'libs/stray/project.json', '{ not json');
      writeRepositoryFile(root, 'wiki/index/local.md', 'kept');
      runGit(root, ['init', '-q']);
      const container = track(
        DiBag.createBuilder()
          .withInstalledModules([nodeHostModule, checkoutModule])
          .buildContainer(),
      );
      const files = container.resolve('checkoutFiles').open(root, 'system-state');
      const wikiIndex = container.resolve('checkoutWikiIndex');
      expect(wikiIndex.readSources(files)).toEqual({
        entries: [{ name: 'one', path: 'apps/one/src/index.ts', readWhen: 'changing one' }],
        defects: [],
      });
      const expected = new Map([[indexFile, 'fresh']]);
      expect(wikiIndex.write(files, expected)).toEqual({
        missing: [indexFile],
        stale: [],
        unexpected: [],
      });
      expect(container.resolve('fileSystem').readText(join(root, 'wiki/index/local.md'))).toBe(
        'kept',
      );
    } finally {
      removeFixture(root);
    }
  });
});
