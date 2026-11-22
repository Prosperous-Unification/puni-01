import { afterEach, describe, expect, test } from 'bun:test';
import { checkoutModule } from '@puni/shared-checkout';
import { type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { recordsModule } from './module';

const containers: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const container of containers.splice(0)) await container.close();
});

function open(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const container = DiBag.createBuilder()
    .withInstalledModules([checkoutModule, recordsModule])
    .withServices(memoryHost(tree, options).services)
    .buildContainer();
  containers.push(container);
  return {
    files: container.resolve('checkoutFiles').open('/r'),
    records: container.resolve('recordsCatalog'),
  };
}

describe('recordsCatalog', () => {
  test('lists the regular files directly in a kind directory, with their kind', () => {
    const { files, records } = open({
      '/r/nav/plans/2031-04-05-a.md': '---\nkind: plan\n---\n',
      '/r/nav/plans/2031-04-06-link.md': { symlink: '2031-04-05-a.md' },
      '/r/nav/plans/deep/x.md': 'x',
      '/r/bur/adr/2031-04-07-b.md': 'b',
      '/r/dash/anything.md': 'x',
    });
    expect(records.list(files)).toEqual({
      records: [
        { path: 'bur/adr/2031-04-07-b.md', kind: 'adr' },
        { path: 'nav/plans/2031-04-05-a.md', kind: 'plan' },
      ],
    });
    expect(records.readFrontMatter(files, 'nav/plans/2031-04-05-a.md')).toEqual({
      fields: [{ key: 'kind', value: 'plan' }],
    });
  });

  test('a git failure is the listing', () => {
    const { files, records } = open({}, { gitFailure: 'git exploded' });
    expect(records.list(files)).toEqual({ failure: 'git exploded' });
  });
});
