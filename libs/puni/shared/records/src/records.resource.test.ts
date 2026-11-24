import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { CheckoutUnlistable, checkoutModule } from '@puni/shared-checkout';
import { closeAfterEach, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { formatReviewBody } from './index';
import { recordsModule } from './module';

const track = closeAfterEach();

function open(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule])
      .withServices(memoryHost(tree, options).services)
      .buildContainer(),
  );
  return {
    files: container.resolve('checkoutFiles').open('/r', 'system-records'),
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
    expect(records.list(files)).toEqual([
      { path: 'bur/adr/2031-04-07-b.md', kind: 'adr' },
      { path: 'nav/plans/2031-04-05-a.md', kind: 'plan' },
    ]);
    expect(records.readFrontMatter(files, 'nav/plans/2031-04-05-a.md')).toEqual({
      fields: [{ key: 'kind', value: 'plan' }],
    });
  });

  test('a git failure is the repository.git defect', () => {
    const { files, records } = open({}, { gitFailure: 'git exploded' });
    throws(() => records.list(files), CheckoutUnlistable);
  });
});

describe('filing a review record', () => {
  test('writes a validated inline body', () => {
    const { files, records } = open({});
    const body = formatReviewBody({
      subject: 'Review the example',
      instruction: 'Use the supplied criteria.',
      criteria: [{ id: 'reliability', goal: 'Reproduce the outcome.' }],
      runs: [0],
      maxRuns: 1,
      stop: 'run-limit',
      findings: [],
    });
    const path = records.file(files, {
      kind: 'finding',
      title: 'Review the example',
      topics: 'review',
      summary: 'Review completed without findings.',
      commit: 'abc1234',
      body,
    });
    expect(path).toMatch(/^bur\/findings\/\d{4}-\d{2}-\d{2}-review-the-example\.md$/u);
    expect(files.readText(path)).toContain('## Findings\n\nNo findings.');
  });

  test('a malformed inline body is refused before writing', () => {
    const { files, records } = open({});
    throws(
      () =>
        records.file(files, {
          kind: 'assessment-review',
          title: 'Unstructured review',
          topics: 'review',
          summary: 'An invalid record.',
          commit: 'abc1234',
          body: '# Empty',
        }),
      /Review/u,
    );
    expect(records.list(files)).toEqual([]);
  });
});
