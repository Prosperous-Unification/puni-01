import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { closeAfterEach, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { MapPage, MapProject } from './map-sources';
import { checkoutModule } from './module';
import {
  indexWordBudget,
  judgePurposes,
  listPartitions,
  type MapContent,
  readInvocation,
  renderMapLevels,
  renderPartitionMap,
  renderRootMap,
} from './render-map';
import { countWords } from './word-count';

const track = closeAfterEach();

function project(name: string, index: readonly string[], readWhen = `changing ${name}`) {
  const root = `libs/${name}`;
  return { name, root, index, readWhen, readFirst: `${root}/src/index.ts` } satisfies MapProject;
}

const pages: readonly MapPage[] = [
  { name: 'Gate', path: 'wiki/gate.md', readWhen: 'the gate fails' },
  { name: 'Layers', path: 'wiki/concepts/layers.md', readWhen: 'placing code' },
  { name: 'Deploy', path: 'wiki/how-to/deploy.md', readWhen: 'deploying' },
  { name: 'Build', path: 'wiki/how-to/build.md', readWhen: 'building' },
];

const purposes = new Map([
  ['app', 'changing the app'],
  ['dash', 'operating nodes'],
  ['dash/ops', 'reaching a node'],
  ['dash/ops/k3s', 'asking the cluster'],
]);

const content: MapContent = {
  pages,
  projects: [
    project('cli', ['app']),
    project('ops', ['dash', 'ops']),
    project('run', ['dash']),
    project('kube', ['dash', 'ops', 'k3s']),
  ],
  purposes,
  invocation: 'puni',
};

describe('the partitions', () => {
  test('are every project partition and every one above it, a parent before its subtree', () => {
    expect(listPartitions(content.projects)).toEqual(['app', 'dash', 'dash/ops', 'dash/ops/k3s']);
  });

  test('a partition shown without a purpose is missing; a purpose of none shown is unused', () => {
    const extra = new Map([...purposes, ['navigator', 'planning']]);
    extra.delete('dash/ops');
    expect(judgePurposes(content.projects, extra)).toEqual({
      missing: ['dash/ops'],
      unused: ['navigator'],
    });
  });
});

describe('renderRootMap', () => {
  test('lists the pages by section and each top-level partition with its command', () => {
    expect(renderRootMap(content)).toBe(
      [
        '# Wiki map',
        '',
        '## Read when',
        '',
        '- the gate fails: [Gate](wiki/gate.md)',
        '',
        '### Concepts',
        '',
        'What the whole repository obeys and why, where no check, type or JSDoc can say it.',
        '',
        '- placing code: [Layers](wiki/concepts/layers.md)',
        '',
        '### How to',
        '',
        'A task that spans the repository, as ordered steps.',
        '',
        '- building: [Build](wiki/how-to/build.md)',
        '- deploying: [Deploy](wiki/how-to/deploy.md)',
        '',
        '## Partitions',
        '',
        '- changing the app: `puni burokrat wiki map app`',
        '- operating nodes: `puni burokrat wiki map dash`',
        '',
      ].join('\n'),
    );
  });

  test('a repository with nothing to map prints only the title', () => {
    expect(renderRootMap({ ...content, pages: [], projects: [] })).toBe('# Wiki map\n');
  });

  test('a page in no section is refused, not listed', () => {
    throws(
      () =>
        renderRootMap({
          ...content,
          pages: [{ name: 'Deploy', path: 'wiki/ops/deploy.md', readWhen: 'deploying' }],
        }),
      /^Error: wiki\/ops\/deploy\.md lies in no section; readMapSources reports it as a defect$/u,
    );
  });
});

describe('renderPartitionMap', () => {
  test('prints its projects, then its whole subtree when that fits the budget', () => {
    expect(renderPartitionMap(content, 'dash')).toBe(
      [
        '# Wiki map: dash',
        '',
        'Read this when operating nodes.',
        '',
        '## Read when',
        '',
        '- changing run: [run](libs/run/src/index.ts)',
        '',
        '## dash/ops',
        '',
        'Read this when reaching a node.',
        '',
        '- changing ops: [ops](libs/ops/src/index.ts)',
        '',
        '## dash/ops/k3s',
        '',
        'Read this when asking the cluster.',
        '',
        '- changing kube: [kube](libs/kube/src/index.ts)',
        '',
      ].join('\n'),
    );
  });

  test('collapses the partitions below it to their purpose and command when the subtree does not fit', () => {
    const long = `changing ${'w '.repeat(18)}x`;
    const crowded: MapContent = {
      ...content,
      invocation: 'bun run puni',
      projects: [
        ...content.projects,
        ...Array.from({ length: 20 }, (_, index) =>
          project(`deep${String(index)}`, ['dash', 'ops', 'k3s'], long),
        ),
      ],
    };
    const text = renderPartitionMap(crowded, 'dash');
    expect(text).toBe(
      [
        '# Wiki map: dash',
        '',
        'Read this when operating nodes.',
        '',
        '## Read when',
        '',
        '- changing run: [run](libs/run/src/index.ts)',
        '',
        '## Partitions',
        '',
        '- reaching a node: `bun run puni burokrat wiki map dash/ops`',
        '',
      ].join('\n'),
    );
    expect(renderPartitionMap(crowded, 'dash/ops')).toContain(
      '- asking the cluster: `bun run puni burokrat wiki map dash/ops/k3s`',
    );
    const levels = renderMapLevels(crowded);
    expect(levels.map(({ partition }) => partition)).toEqual([
      undefined,
      'app',
      'dash',
      'dash/ops',
      'dash/ops/k3s',
    ]);
    const over = levels.filter(({ text: level }) => countWords(level) > indexWordBudget);
    expect(over.map(({ partition }) => partition)).toEqual(['dash/ops/k3s']);
  });

  test('a partition the map does not show, or one without a purpose, is refused', () => {
    throws(() => renderPartitionMap(content, 'nope'), /^Error: the map shows no partition nope$/u);
    throws(
      () => renderPartitionMap({ ...content, purposes: new Map() }, 'app'),
      /^Error: partition app has no purpose; judgePurposes reports it$/u,
    );
  });

  test('every level is deterministic and LF-only', () => {
    const reversed = { ...content, projects: [...content.projects].reverse() };
    expect(renderMapLevels(reversed)).toEqual(renderMapLevels(content));
    for (const { text } of renderMapLevels(content)) expect(text).not.toContain('\r');
  });
});

describe('readInvocation', () => {
  function open(tree: MemoryTree) {
    const host = memoryHost(tree);
    const container = track(
      DiBag.createBuilder()
        .withInstalledModules([checkoutModule])
        .withServices(host.services)
        .buildContainer(),
    );
    return container.resolve('checkoutFiles').open('/r', 'system-state');
  }

  test.each([
    ['a puni script', { scripts: { puni: 'bun apps/puni/cli/src/entrypoint.ts' } }, 'bun run puni'],
    ['other scripts', { scripts: { gate: 'puni burokrat check' } }, 'puni'],
    ['no scripts', { name: 'demo' }, 'puni'],
  ])('a package.json with %s runs it as %s', (_name, manifest, invocation) => {
    expect(readInvocation(open({ '/r/package.json': JSON.stringify(manifest) }))).toBe(invocation);
  });

  test('a repository without package.json runs the installed puni', () => {
    expect(readInvocation(open({ '/r/README.md': 'r' }))).toBe('puni');
  });
});
