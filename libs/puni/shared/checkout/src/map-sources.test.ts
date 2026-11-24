import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { join } from 'node:path';
import {
  closeAfterEach,
  type MemoryTree,
  memoryHost,
  nodeHostModule,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { CheckoutFiles, ProjectSource } from './contract';
import { CheckoutUnlistable } from './failures';
import { type MapProject, readMapSources, readWhenRemedy, sectionRemedy } from './map-sources';
import { checkoutModule } from './module';

const scratchDirectories = removeScratchDirectoriesAfterEach();

const track = closeAfterEach();

const one: MapProject = {
  name: 'one',
  root: 'apps/one',
  index: ['app'],
  readWhen: 'changing one',
  readFirst: 'apps/one/src/index.ts',
};

/** A project source giving `one` and one defect at `path`, whatever the checkout holds. */
function fixedSource(path: string): ProjectSource {
  return {
    readProjects: () => ({
      projects: [one],
      defects: [{ topic: 'scope', path, message: 'has no place', remedy: 'place it' }],
    }),
  };
}

function openMemory(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const host = memoryHost(tree, options);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule])
      .withServices(host.services)
      .buildContainer(),
  );
  return container.resolve('checkoutFiles').open('/r', 'system-state');
}

describe('readMapSources', () => {
  test('reads every page and the projects of every source in order, defects sorted by path', () => {
    const files = openMemory({
      '/r/wiki/deploy.md': '---\ntitle: Deploy\nread-when: deploying\n---\n',
      '/r/wiki/how-to/build.md': '---\ntitle: Build\nread-when: building\n---\n',
      '/r/wiki/notes.txt': 'not a page',
    });
    expect(readMapSources(files, [fixedSource('libs/b'), fixedSource('libs/a')])).toEqual({
      pages: [
        { name: 'Deploy', path: 'wiki/deploy.md', readWhen: 'deploying' },
        { name: 'Build', path: 'wiki/how-to/build.md', readWhen: 'building' },
      ],
      projects: [one, one],
      defects: [
        { topic: 'scope', path: 'libs/a', message: 'has no place', remedy: 'place it' },
        { topic: 'scope', path: 'libs/b', message: 'has no place', remedy: 'place it' },
      ],
    });
  });

  test('with no project source the map holds only pages', () => {
    const files = openMemory({ '/r/wiki/gate.md': '---\ntitle: Gate\nread-when: gating\n---\n' });
    expect(readMapSources(files, [])).toEqual({
      pages: [{ name: 'Gate', path: 'wiki/gate.md', readWhen: 'gating' }],
      projects: [],
      defects: [],
    });
  });

  test.each([
    ['---\ntitle: Deploy\n---\n', 'has no read-when'],
    ['---\nread-when: deploying\n---\n', 'has no title'],
    ['---\ntitle: Deploy\nread-when:\n---\n', 'has no read-when'],
    [
      '---\ntitle: Deploy\nread-when: Deploying\n---\n',
      'read-when must start with a lower-case letter',
    ],
    ['---\ntitle: Deploy\nread-when: deploying.\n---\n', 'read-when must not end with a full stop'],
    ['# Deploy\n', 'does not begin with front matter'],
    ['---\ntitle: Deploy\n', 'does not begin with front matter'],
  ])('page %j is a read-when defect: %s', (page, message) => {
    const files = openMemory({ '/r/wiki/deploy.md': page });
    expect(readMapSources(files, []).defects).toEqual([
      { topic: 'read-when', path: 'wiki/deploy.md', message, remedy: readWhenRemedy },
    ]);
  });

  test.each([
    ['wiki/ops/deploy.md', 'wiki/ops/'],
    ['wiki/how-to/ops/deploy.md', 'wiki/how-to/ops/'],
  ])('a page at %s is a section defect, whatever its front matter', (path, directory) => {
    const files = openMemory({ [`/r/${path}`]: '# no front matter\n' });
    expect(readMapSources(files, []).defects).toEqual([
      {
        topic: 'section',
        path,
        message: `lies in ${directory}, which is not wiki/ or a section (wiki/concepts/, wiki/how-to/)`,
        remedy: sectionRemedy,
      },
    ]);
  });

  test('a git that cannot list the checkout is the repository.git defect, not a source defect', () => {
    const files = openMemory({}, { gitFailure: 'git exploded' });
    throws(() => readMapSources(files, []), CheckoutUnlistable);
  });

  test('a page git ignores is not read, and a source reads the same checkout', () => {
    const root = join(scratchDirectories.createDirectory('puni-map-sources-'), 'demo');
    writeRepositoryFile(root, '.gitignore', 'wiki/scratch.md\n');
    writeRepositoryFile(root, 'wiki/scratch.md', '# no front matter\n');
    writeRepositoryFile(root, 'wiki/gate.md', '---\ntitle: Gate\nread-when: gating\n---\n');
    runGit(root, ['init', '-q']);
    const container = track(
      DiBag.createBuilder().withInstalledModules([nodeHostModule, checkoutModule]).buildContainer(),
    );
    const files = container.resolve('checkoutFiles').open(root, 'system-state');
    const seen: CheckoutFiles[] = [];
    const source: ProjectSource = {
      readProjects: (read) => {
        seen.push(read);
        return { projects: [], defects: [] };
      },
    };
    expect(readMapSources(files, [source])).toEqual({
      pages: [{ name: 'Gate', path: 'wiki/gate.md', readWhen: 'gating' }],
      projects: [],
      defects: [],
    });
    expect(seen).toEqual([files]);
  });
});
