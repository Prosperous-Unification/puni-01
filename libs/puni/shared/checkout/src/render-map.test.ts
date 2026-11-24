import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { closeAfterEach, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { MapPage, MapProject } from './map-sources';
import { checkoutModule } from './module';
import {
  comparePartitions,
  indexWordBudget,
  judgePurposes,
  listPartitions,
  type MapContent,
  readInvocation,
  renderMapLevels,
  renderPartitionMap,
  renderRootMap,
  renderSectionMap,
} from './render-map';
import { wikiSections } from './wiki-sections';
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

const [concepts, howTo] = wikiSections;
if (concepts === undefined || howTo === undefined) throw new Error('two wiki sections expected');

/** `count` words: `word` repeated, for a phrase of an exact length. */
const words = (count: number) => Array.from({ length: count }, () => 'w').join(' ');

describe('the partitions', () => {
  test('are every project partition and every one above it, a parent right before its subtree', () => {
    const projects = ['a-b', 'a/b-c', 'a/b/d', 'a'].map((path, at) =>
      project(`p${String(at)}`, path.split('/')),
    );
    expect(listPartitions(projects)).toEqual(['a', 'a/b', 'a/b/d', 'a/b-c', 'a-b']);
    expect(['a-b', 'a/b', 'a'].sort(comparePartitions)).toEqual(['a', 'a/b', 'a-b']);
  });

  test('a purpose problem is each shown partition without one, an unused one and a bad phrase', () => {
    const extra = new Map([...purposes, ['navigator', 'Planning.']]);
    extra.delete('dash/ops');
    expect(judgePurposes(content.projects, extra).map(({ message }) => message)).toEqual([
      'map has no purpose for partition dash/ops, which the map shows',
      'map gives a purpose for partition navigator, where no project is placed',
      'map.navigator must start with a lower-case letter, must not end with a full stop',
    ]);
    expect(judgePurposes(content.projects, extra, false).map(({ partition }) => partition)).toEqual(
      ['dash/ops', 'navigator'],
    );
  });

  test('a top-level partition named as a wiki section is a problem', () => {
    const named = [project('one', ['concepts'])];
    expect(judgePurposes(named, new Map([['concepts', 'reading concepts']]))).toEqual([
      {
        partition: 'concepts',
        message:
          'partition concepts has the name of the wiki section wiki/concepts/, which `wiki map concepts` prints',
        remedy: 'place the projects of concepts in a partition of another name',
      },
    ]);
  });
});

describe('renderRootMap', () => {
  test('lists the pages by section and each top-level partition with its command', () => {
    expect(renderRootMap(content)).toEqual({
      level: { kind: 'root' },
      text: [
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
      words: 70,
      largest: 'partitions',
    });
  });

  test('collapses its sections to their purpose and command when the whole does not fit', () => {
    const many = Array.from({ length: 20 }, (_, at) => ({
      name: `P${String(at)}`,
      path: `wiki/how-to/p${String(at)}.md`,
      readWhen: words(18),
    }));
    const crowded = { ...content, pages: [...pages, ...many] };
    expect(renderRootMap(crowded).text).toBe(
      [
        '# Wiki map',
        '',
        '## Read when',
        '',
        '- the gate fails: [Gate](wiki/gate.md)',
        '',
        '## Sections',
        '',
        `- ${concepts.purpose}: \`puni burokrat wiki map concepts\``,
        `- ${howTo.purpose}: \`puni burokrat wiki map how-to\``,
        '',
        '## Partitions',
        '',
        '- changing the app: `puni burokrat wiki map app`',
        '- operating nodes: `puni burokrat wiki map dash`',
        '',
      ].join('\n'),
    );
    const section = renderSectionMap(crowded, howTo);
    expect(section.text).toStartWith(
      '# Wiki map: how-to\n\nA task that spans the repository, as ordered steps.\n\n## Read when\n\n',
    );
    expect([section.words > indexWordBudget, section.largest]).toEqual([true, 'pages']);
  });

  /**
   * `content` with pages directly in `wiki/` padding its expanded root to exactly the budget, and
   * `extra` more words on the last of them.
   */
  function padRoot(extra: number): MapContent {
    const padded: MapPage[] = [];
    const withPads = () => ({ ...content, pages: [...pages, ...padded] });
    for (let at = 0; ; at += 1) {
      const left = indexWordBudget - renderRootMap(withPads()).words;
      if (left === 0) break;
      const take = left >= 25 ? 22 : left;
      padded.push({
        name: `Pad${String(at)}`,
        path: `wiki/pad${String(at)}.md`,
        readWhen: words(take - 2),
      });
    }
    const last = padded.at(-1);
    if (last === undefined) throw new Error('nothing padded');
    padded[padded.length - 1] = { ...last, readWhen: `${last.readWhen}${' w'.repeat(extra)}` };
    return withPads();
  }

  test.each([
    [0, false],
    [1, true],
  ])(
    '%i words over the budget expanded, the root collapses its sections: %p',
    (extra, collapsed) => {
      const root = renderRootMap(padRoot(extra));
      expect(root.text.includes('## Sections')).toBe(collapsed);
      if (!collapsed) expect(root.words).toBe(indexWordBudget);
    },
  );

  test('over budget even collapsed, it names the kind of line that holds the most words', () => {
    const tops = Array.from({ length: 30 }, (_, at) => `top${String(at)}`);
    const wide: MapContent = {
      ...content,
      projects: tops.map((top) => project(top, [top])),
      purposes: new Map(tops.map((top) => [top, words(15)])),
    };
    const root = renderRootMap(wide);
    expect([root.words > indexWordBudget, root.largest]).toEqual([true, 'partitions']);
  });

  test('a repository with nothing to map prints only the title', () => {
    expect(renderRootMap({ ...content, pages: [], projects: [] })).toEqual({
      level: { kind: 'root' },
      text: '# Wiki map\n',
      words: 3,
      largest: undefined,
    });
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
    expect(renderPartitionMap(content, 'dash').text).toBe(
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

  test('an intermediate partition with no project of its own prints only its purpose and subtree', () => {
    const middle: MapContent = {
      ...content,
      projects: [project('kube', ['dash', 'ops', 'k3s'])],
    };
    expect(renderPartitionMap(middle, 'dash/ops').text).toBe(
      [
        '# Wiki map: dash/ops',
        '',
        'Read this when reaching a node.',
        '',
        '## dash/ops/k3s',
        '',
        'Read this when asking the cluster.',
        '',
        '- changing kube: [kube](libs/kube/src/index.ts)',
        '',
      ].join('\n'),
    );
    expect(renderPartitionMap(middle, 'dash').text).toContain('## dash/ops\n\nRead this when');
  });

  test('a sibling partition sharing a prefix is not part of the subtree', () => {
    const siblings: MapContent = {
      ...content,
      projects: [project('a', ['dash']), project('b', ['dash-x'])],
      purposes: new Map([
        ['dash', 'operating nodes'],
        ['dash-x', 'operating others'],
      ]),
    };
    expect(renderPartitionMap(siblings, 'dash').text).not.toContain('dash-x');
  });

  /** `content` with `dash/ops` holding one more project whose read-when pads `dash` to `total` words. */
  function padDash(total: number, invocation = 'puni'): MapContent {
    const base = { ...content, invocation };
    const filler = (readWhen: string) => ({
      ...base,
      projects: [...base.projects, project('pad', ['dash', 'ops'], readWhen)],
    });
    const without = renderPartitionMap(filler('w'), 'dash').words;
    return filler(words(total - without + 1));
  }

  test.each([
    [indexWordBudget, 'whole'],
    [indexWordBudget + 1, 'collapsed'],
  ])('at %i words of its whole subtree it prints it %s', (total, form) => {
    const padded = padDash(total);
    const level = renderPartitionMap(padded, 'dash');
    const collapsed = level.text.includes('## Partitions');
    expect([collapsed ? 'collapsed' : 'whole', collapsed ? total : level.words]).toEqual([
      form,
      total,
    ]);
    if (collapsed) expect(level.largest).toBe('children');
  });

  test('a puni script makes every command line two words longer', () => {
    const bunRun = renderPartitionMap(
      { ...content, invocation: 'bun run puni', projects: [...content.projects, ...[]] },
      'dash',
    );
    expect(renderRootMap({ ...content, invocation: 'bun run puni' }).words).toBe(
      renderRootMap(content).words + 4,
    );
    expect(bunRun.words).toBe(renderPartitionMap(content, 'dash').words);
  });

  test('collapses the partitions below it when the subtree does not fit, naming the overflow', () => {
    const long = `changing ${words(18)}`;
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
    expect(renderPartitionMap(crowded, 'dash').text).toBe(
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
    const levels = renderMapLevels(crowded);
    expect(
      levels.map(({ level }) =>
        level.kind === 'root'
          ? 'root'
          : level.kind === 'section'
            ? level.section.directory
            : level.path,
      ),
    ).toEqual(['root', 'concepts', 'how-to', 'app', 'dash', 'dash/ops', 'dash/ops/k3s']);
    const over = levels.filter(({ words: count }) => count > indexWordBudget);
    expect(over.map(({ level, largest }) => [level, largest])).toEqual([
      [{ kind: 'partition', path: 'dash/ops/k3s' }, 'projects'],
    ]);
    expect(over.map(({ text }) => countWords(text))).toEqual(over.map(({ words: count }) => count));
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
