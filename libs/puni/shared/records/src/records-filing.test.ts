import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import {
  CheckoutPathRefused,
  checkoutModule,
  FileUnreadable,
  parseFrontMatter,
} from '@puni/shared-checkout';
import { closeAfterEach, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { RecordDraft } from './contract';
import {
  BodyFileMissing,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
  SupersededRecordRefused,
} from './failures';
import { judgeRecordValue } from './record-values';
import { recordKeyForms } from './record-values';
import { slugifyTitle } from './record-text';
import { recordsModule } from './module';

const track = closeAfterEach();

const draft: RecordDraft = {
  kind: 'plan',
  title: 'Run k3s: first steps!',
  topics: 'ops, k3s',
  summary: 'How the first node gets its cluster.',
  commit: 'abc1234',
};

function open(
  tree: MemoryTree = {},
  options: {
    readonly now?: Date;
    readonly beforeBodyRead?: (host: ReturnType<typeof memoryHost>) => void;
    readonly afterMakeDirectory?: (path: string, host: ReturnType<typeof memoryHost>) => void;
  } = {},
) {
  const host = memoryHost(tree, options.now === undefined ? {} : { now: options.now });
  const fileSystem = host.services.fileSystem();
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, recordsModule])
      .withServices({
        ...host.services,
        fileSystem: (): typeof fileSystem => ({
          ...fileSystem,
          readText(path) {
            if (path === '/notes/body.md') options.beforeBodyRead?.(host);
            return fileSystem.readText(path);
          },
          makeDirectory(path) {
            fileSystem.makeDirectory(path);
            options.afterMakeDirectory?.(path, host);
          },
        }),
      })
      .buildContainer(),
  );
  const files = container.resolve('checkoutFiles').open('/r', 'system-records');
  return {
    host,
    file: (changes: Partial<RecordDraft> = {}) =>
      container.resolve('recordsCatalog').file(files, { ...draft, ...changes }),
  };
}

describe('slugifyTitle', () => {
  test.each([
    ['Run k3s: first steps!', 'run-k3s-first-steps'],
    ['  --Ünïcode__and  spaces--  ', 'n-code-and-spaces'],
    ['!!!', ''],
    ['', ''],
  ])('%j is %j', (title, slug) => {
    expect(slugifyTitle(title)).toBe(slug);
  });
});

describe('recordsCatalog.file', () => {
  test('files the record dated today in UTC with the front matter the rules require, its document type first', () => {
    const { host, file } = open();
    expect(file()).toBe('nav/plans/2031-04-05-run-k3s-first-steps.md');
    const text = host.nodes.get('/r/nav/plans/2031-04-05-run-k3s-first-steps.md');
    expect(text).toBe(
      [
        '---',
        'puni-doc-type: record',
        'kind: plan',
        'title: Run k3s: first steps!',
        'date: 2031-04-05',
        'commit: abc1234',
        'topics: ops, k3s',
        'summary: How the first node gets its cluster.',
        '---',
        '',
        '# Run k3s: first steps!',
        '',
      ].join('\n'),
    );
    const parsed = parseFrontMatter(typeof text === 'string' ? text : '');
    if (!('fields' in parsed)) throw new Error('no front matter');
    for (const { key, value } of parsed.fields) {
      if (key === 'kind' || key === 'title' || key === 'date' || key === 'commit') {
        const recordFile = {
          path: 'nav/plans/2031-04-05-run-k3s-first-steps.md',
          kind: 'plan',
        } as const;
        expect([key, judgeRecordValue(recordFile, key, value)]).toEqual([key, undefined]);
      }
    }
  });

  test('the date is the UTC day, whatever the local time zone', () => {
    const zone = process.env['TZ'];
    process.env['TZ'] = 'Pacific/Kiritimati';
    try {
      expect(open({}, { now: new Date('2031-04-05T23:30:00Z') }).file()).toStartWith(
        'nav/plans/2031-04-05-',
      );
    } finally {
      if (zone === undefined) delete process.env['TZ'];
      else process.env['TZ'] = zone;
    }
  });

  test('without a body file the body is the title heading, then each section empty', () => {
    const { host, file } = open();
    const path = file({ sections: ['Decision', 'Why'] });
    expect(host.nodes.get(`/r/${path}`)).toEndWith(
      '---\n\n# Run k3s: first steps!\n\n## Decision\n\n## Why\n',
    );
    const withBody = open({ '/notes/body.md': 'Mine.\n' });
    const bodyPath = withBody.file({ sections: ['Decision'], bodyFile: '/notes/body.md' });
    expect(withBody.host.nodes.get(`/r/${bodyPath}`)).toEndWith('---\n\nMine.\n');
  });

  test('the body is the body file, given a final newline', () => {
    const { host, file } = open({ '/notes/body.md': '# Plan\n\nSteps.' });
    const path = file({ bodyFile: '/notes/body.md' });
    expect(host.nodes.get(`/r/${path}`)).toEndWith('---\n\n# Plan\n\nSteps.\n');
  });

  test.each([
    [{ title: '' }, 'title is empty; expected non-empty text on one line'],
    [{ title: 'two\nlines' }, 'title is not on one line; expected non-empty text on one line'],
    [
      { topics: 'Ops,k3s' },
      `topics has invalid entries ["Ops"]; expected ${recordKeyForms.topics}`,
    ],
    [{ topics: 'a,a' }, `topics repeats a; expected ${recordKeyForms.topics}`],
    [{ topics: 'a,b,c,d,e,f' }, `topics has 6 entries; expected ${recordKeyForms.topics}`],
    [{ summary: ' ' }, `summary is empty; expected ${recordKeyForms.summary}`],
    [{ summary: 'w '.repeat(31) }, `summary has 31 words; expected ${recordKeyForms.summary}`],
    [{ commit: 'HEAD' }, `commit is HEAD; expected ${recordKeyForms.commit}`],
  ] as const)('%j is refused: %s', (changes, message) => {
    const { host, file } = open();
    throws(
      () => file(changes),
      (caught) => caught instanceof RecordValueRefused && caught.message === message,
    );
    expect([...host.nodes.keys()]).toEqual([]);
  });

  test('a title with no letter or digit is refused', () => {
    throws(
      () => open().file({ title: '!!!' }),
      (caught) =>
        caught instanceof RecordTitleUnsluggable &&
        caught.message ===
          'title "!!!" gives an empty file name; it needs at least one letter or digit',
    );
  });

  test('an existing record is refused and kept', () => {
    const existing = '/r/nav/plans/2031-04-05-run-k3s-first-steps.md';
    const { host, file } = open({ [existing]: 'kept' });
    throws(
      () => file(),
      (caught) =>
        caught instanceof RecordExists &&
        caught.message ===
          'nav/plans/2031-04-05-run-k3s-first-steps.md already exists in the records repository; a record is never overwritten, so give another title or wait a day',
    );
    expect(host.nodes.get(existing)).toBe('kept');
  });

  test('a record filed while the draft is read is kept', () => {
    const path = '/r/nav/plans/2031-04-05-run-k3s-first-steps.md';
    const { host, file } = open(
      { '/notes/body.md': 'New draft.' },
      {
        beforeBodyRead({ nodes }) {
          nodes.set(path, 'Concurrent record.');
        },
      },
    );
    throws(() => file({ bodyFile: '/notes/body.md' }), RecordExists);
    expect(host.nodes.get(path)).toBe('Concurrent record.');
  });

  test.each(['nav', 'nav/plans'])('refuses a symlink at %s before publishing a record', (path) => {
    const { host, file } = open({
      [`/r/${path}`]: { symlink: '/outside' },
      '/outside': { directory: true },
    });
    throws(() => file(), CheckoutPathRefused);
    expect([...host.nodes.keys()]).toEqual([`/r/${path}`, '/outside']);
  });

  test('checks a newly made parent again before creating its child', () => {
    const { host, file } = open(
      { '/r/existing': 'Keep.', '/outside': { directory: true } },
      {
        afterMakeDirectory(path, { nodes }) {
          if (path === '/r/nav') nodes.set(path, { symlink: '/outside' });
        },
      },
    );
    throws(() => file(), CheckoutPathRefused);
    expect(host.nodes.has('/r/nav/plans')).toBe(false);
  });

  test('a missing body file is refused; one that cannot be read is FileUnreadable', () => {
    throws(
      () => open().file({ bodyFile: '/notes/missing.md' }),
      (caught) =>
        caught instanceof BodyFileMissing &&
        caught.message === 'the body file /notes/missing.md does not exist',
    );
    throws(
      () => open({ '/notes/dir': { directory: true } }).file({ bodyFile: '/notes/dir' }),
      (caught) =>
        caught instanceof FileUnreadable &&
        caught.message === 'cannot read /notes/dir: EISDIR: /notes/dir',
    );
  });

  const old = '/r/nav/plans/2031-04-01-old-plan.md';
  const oldText =
    '---\nkind: plan\ntitle: Old plan\ndate: 2031-04-01\ncommit: abc1234\ntopics: ops\nsummary: The old plan.\n---\n\n# Old plan\n';

  test('superseding a record links both: the new one names the old, the old names the new', () => {
    const { host, file } = open({ [old]: oldText });
    const path = file({ supersedes: 'nav/plans/2031-04-01-old-plan.md' });
    expect(host.nodes.get(`/r/${path}`)).toContain(
      'summary: How the first node gets its cluster.\nsupersedes: nav/plans/2031-04-01-old-plan.md\n---\n',
    );
    expect(host.nodes.get(old)).toBe(
      oldText.replace('\n---\n\n', `\nsuperseded-by: ${path}\n---\n\n`),
    );
  });

  test.each([
    ['../outside.md', `supersedes is "../outside.md"; expected ${recordKeyForms.supersedes}`],
    [
      'nav/plans/2031-04-02-missing.md',
      'supersedes nav/plans/2031-04-02-missing.md is not a record in a kind directory',
    ],
    ['nav/notes.md', 'supersedes nav/notes.md is not a record in a kind directory'],
    [
      'nav/plans/2031-04-03-bad.md',
      'supersedes nav/plans/2031-04-03-bad.md has front matter that cannot be read',
    ],
    [
      'nav/plans/2031-04-04-done.md',
      'supersedes nav/plans/2031-04-04-done.md is already superseded by nav/plans/2031-04-04-next.md',
    ],
  ] as const)('superseding %s is refused and writes nothing', (supersedes, message) => {
    const tree: MemoryTree = {
      [old]: oldText,
      '/r/nav/notes.md': oldText,
      '/r/nav/plans/2031-04-03-bad.md': 'no front matter\n',
      '/r/nav/plans/2031-04-04-done.md': oldText.replace(
        '\n---\n\n',
        '\nsuperseded-by: nav/plans/2031-04-04-next.md\n---\n\n',
      ),
    };
    const { host, file } = open(tree);
    throws(
      () => file({ supersedes }),
      (caught) =>
        (caught instanceof SupersededRecordRefused || caught instanceof RecordValueRefused) &&
        caught.message === message,
    );
    expect(Object.fromEntries(host.nodes)).toEqual(tree);
  });
});
