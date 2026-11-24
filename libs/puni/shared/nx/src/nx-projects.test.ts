import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkoutModule, readWhenRemedy } from '@puni/shared-checkout';
import {
  closeAfterEach,
  type MemoryTree,
  memoryHost,
  nodeHostModule,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { nxModule } from './module';
import {
  invalidJsonRemedy,
  missingDirectoryRemedy,
  nameRemedy,
  nxPlacementHint,
  readFirstRemedy,
  scopeRemedy,
} from './remedies';

const scratchDirectories = removeScratchDirectoriesAfterEach();

const track = closeAfterEach();

const project = (
  name: string,
  metadata: Record<string, unknown>,
  tags: unknown = ['scope:app', 'type:app'],
) => JSON.stringify({ name, tags, metadata });

/** A valid workspace: one project under `apps/` and an empty `libs/`. */
const workspace: MemoryTree = {
  '/r/nx.json': '{}',
  '/r/apps/one/project.json': project('one', { readWhen: 'changing one', readFirst: 'src/a.ts' }),
  '/r/apps/one/src/a.ts': 'export {};',
  '/r/libs': { directory: true },
};

const one = {
  name: 'one',
  root: 'apps/one',
  index: ['app'],
  readWhen: 'changing one',
  readFirst: 'apps/one/src/a.ts',
};

function readMemory(tree: MemoryTree) {
  const host = memoryHost(tree);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, nxModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const files = container.resolve('checkoutFiles').open('/r', 'system-state');
  return container.resolve('nxProjectSource').readProjects(files);
}

/** The defects of `one` when its `project.json` holds `metadata` and `tags`. */
function defectsOf(metadata: Record<string, unknown>, tags?: unknown) {
  return readMemory({ ...workspace, '/r/apps/one/project.json': project('one', metadata, tags) })
    .defects;
}

describe('the Nx project source', () => {
  test('reads each project with its scope tag as its partition, its readFirst from the root', () => {
    expect(readMemory(workspace)).toEqual({ projects: [one], defects: [] });
  });

  test('metadata.index places a project deeper than its scope tag, or anywhere', () => {
    const placed = readMemory({
      ...workspace,
      '/r/apps/one/project.json': project(
        'one',
        { readWhen: 'changing one', readFirst: 'src/a.ts', index: ['dash', 'ops'] },
        ['type:app'],
      ),
    });
    expect(placed).toEqual({ projects: [{ ...one, index: ['dash', 'ops'] }], defects: [] });
  });

  test.each([[[]], ['dash'], [['Dash']], [['dash', '']], [['dash/ops']], [[1]]])(
    'metadata.index %j is a scope defect',
    (index) => {
      expect(defectsOf({ readWhen: 'changing one', readFirst: 'src/a.ts', index })).toEqual([
        {
          topic: 'scope',
          path: 'apps/one/project.json',
          message:
            'project one metadata.index must be a non-empty array of lower-case partition segments',
          remedy: scopeRemedy,
        },
      ]);
    },
  );

  test.each([
    [null, 'project one has no scope:<name> tag'],
    [['type:app'], 'project one has no scope:<name> tag'],
    [['scope:app', 'scope:dash'], 'project one has 2 scope tags; one is allowed'],
    [['scope:Dash'], 'project one tag scope:Dash cannot name a partition'],
    [['scope:../x'], 'project one tag scope:../x cannot name a partition'],
  ])('a project tagged %j and without metadata.index is a scope defect: %s', (tags, message) => {
    expect(defectsOf({ readWhen: 'changing one', readFirst: 'src/a.ts' }, tags)).toEqual([
      { topic: 'scope', path: 'apps/one/project.json', message, remedy: scopeRemedy },
    ]);
  });

  test.each([
    [undefined, 'project one has no metadata.readWhen'],
    ['Changing one', 'project one metadata.readWhen must start with a lower-case letter'],
    ['changing one.', 'project one metadata.readWhen must not end with a full stop'],
    ['changing\none', 'project one metadata.readWhen must be one line'],
    [`changing ${'w '.repeat(20)}`, 'project one metadata.readWhen has 21 words; at most 20'],
  ])('readWhen %j is a read-when defect: %s', (readWhen, message) => {
    expect(defectsOf({ readWhen, readFirst: 'src/a.ts' })).toEqual([
      { topic: 'read-when', path: 'apps/one/project.json', message, remedy: readWhenRemedy },
    ]);
  });

  test.each([
    [undefined, 'is missing'],
    ['src/missing.ts', 'names a missing file'],
    ['src', 'must name a regular file'],
    ['.', 'must stay inside the project'],
    ['../two/src/a.ts', 'must stay inside the project'],
    ['/etc/hostname', 'must be a relative POSIX path'],
  ])('readFirst %j is a read-first defect: %s', (readFirst, problem) => {
    expect(defectsOf({ readWhen: 'changing one', readFirst })).toEqual([
      {
        topic: 'read-first',
        path: 'apps/one/project.json',
        message: `project one metadata.readFirst ${problem}`,
        remedy: readFirstRemedy,
      },
    ]);
  });

  test.each([
    ['{ not json', /^is not valid JSON: /u, invalidJsonRemedy],
    ['[]', /^is not a JSON object$/u, invalidJsonRemedy],
    ['{}', /^has no name$/u, nameRemedy],
  ])(
    'a project.json holding %s is one read-when defect with its own remedy',
    (text, message, remedy) => {
      const { defects } = readMemory({ ...workspace, '/r/libs/two/project.json': text });
      expect(defects).toHaveLength(1);
      expect(defects[0]).toMatchObject({
        topic: 'read-when',
        path: 'libs/two/project.json',
        remedy,
      });
      expect(defects[0]?.message).toMatch(message);
    },
  );

  test('its placement hint, for remedies, names metadata.index', () => {
    const container = track(
      DiBag.createBuilder().withInstalledModules([nxModule]).buildContainer(),
    );
    expect(container.resolve('nxProjectSource').placementHint).toBe(nxPlacementHint);
    expect(nxPlacementHint).toContain('metadata.index');
  });

  test('a workspace needs apps/ and libs/; a repository without nx.json needs neither', () => {
    expect(readMemory({ '/r/README.md': 'r' })).toEqual({ projects: [], defects: [] });
    expect(readMemory({ '/r/nx.json': '{}' }).defects).toEqual([
      {
        topic: 'read-when',
        path: 'apps',
        message: 'directory is missing',
        remedy: missingDirectoryRemedy('apps'),
      },
      {
        topic: 'read-when',
        path: 'libs',
        message: 'directory is missing',
        remedy: missingDirectoryRemedy('libs'),
      },
    ]);
  });

  test('a project below node_modules, outside apps/ and libs/, or ignored by git is none', () => {
    const root = join(scratchDirectories.createDirectory('puni-nx-'), 'demo');
    writeProject(root, 'apps/one', 'one', {
      readWhen: 'changing one',
      readFirst: 'src/index.ts',
    });
    writeRepositoryFile(root, '.gitignore', 'libs/stray/\n');
    writeRepositoryFile(root, 'libs/stray/project.json', '{ not json');
    writeRepositoryFile(root, 'libs/node_modules/x/project.json', '{}');
    writeRepositoryFile(root, 'tools/x/project.json', '{}');
    runGit(root, ['init', '-q']);
    const container = track(
      DiBag.createBuilder()
        .withInstalledModules([nodeHostModule, checkoutModule, nxModule])
        .buildContainer(),
    );
    const files = container.resolve('checkoutFiles').open(root, 'system-state');
    expect(container.resolve('nxProjectSource').readProjects(files)).toEqual({
      projects: [{ ...one, readFirst: 'apps/one/src/index.ts' }],
      defects: [],
    });
  });
});
