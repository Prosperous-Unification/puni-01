import { describe, expect, test } from 'bun:test';
import { closeAfterEach, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { CheckoutPathRefused, CheckoutRootRefused } from './failures';
import { checkoutModule } from './module';

const track = closeAfterEach();

function openHost(tree: MemoryTree) {
  const host = memoryHost(tree);
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule])
      .withServices(host.services)
      .buildContainer(),
  );
  return { host, checkoutFiles: container.resolve('checkoutFiles') };
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (failure) {
    return failure;
  }
  throw new Error('nothing was thrown');
}

describe('checkoutFiles.create', () => {
  test('a new system-state repository adds its entry files, its link and the index', () => {
    const { host, checkoutFiles } = openHost({ '/w/new/.git/HEAD': 'ref' });
    const state = checkoutFiles.create('/w/new', 'system-state', 'empty-directory');
    for (const path of ['puni.json', 'AGENTS.md', 'README.md', '.gitignore']) {
      state.write(path, path);
    }
    state.link('CLAUDE.md', 'AGENTS.md');
    state.write('wiki/index/index.md', 'index');
    expect(host.nodes.get('/w/new/CLAUDE.md')).toEqual({ symlink: 'AGENTS.md' });
    expect(host.nodes.get('/w/new/wiki/index/index.md')).toBe('index');
    expect(host.nodes.get('/w/new/puni.json')).toBe('puni.json');
  });

  test('a new records repository is made where nothing was, with only its entry files', () => {
    const { host, checkoutFiles } = openHost({ '/w/new': { directory: true } });
    const records = checkoutFiles.create('/w/new-records', 'system-records', 'absent');
    records.link('CLAUDE.md', 'AGENTS.md');
    records.write('AGENTS.md', 'records');
    expect(host.nodes.get('/w/new-records/AGENTS.md')).toBe('records');
    for (const path of ['puni.json', 'README.md', 'wiki/index/index.md', 'nav/plans/a.md']) {
      expect(
        caught(() => {
          records.write(path, 'x');
        }),
      ).toMatchObject({
        message: `${path}: is not a file a new system-records repository starts with (.gitignore, AGENTS.md)`,
      });
    }
    expect(host.nodes.has('/w/new-records/puni.json')).toBe(false);
  });

  test.each([
    ['README.md', 'link', 'is not a symlink'],
    ['CLAUDE.md', 'file', 'is not a file'],
    ['../outside.md', 'file', 'is not a path inside the checkout'],
    ['src/main.ts', 'file', 'is not a file'],
  ] as const)('%s as a %s is refused: %s', (path, how, reason) => {
    const { host, checkoutFiles } = openHost({ '/w/new': { directory: true } });
    const state = checkoutFiles.create('/w/new', 'system-state', 'empty-directory');
    const failure = caught(() => {
      if (how === 'file') state.write(path, 'x');
      else state.link(path, 'AGENTS.md');
    });
    if (!(failure instanceof CheckoutPathRefused)) throw new Error('not CheckoutPathRefused');
    expect(failure.message).toStartWith(`${path}: ${reason}`);
    expect([...host.nodes.keys()]).toEqual(['/w/new']);
  });

  test('a path written twice is refused and kept', () => {
    const { host, checkoutFiles } = openHost({ '/w/new': { directory: true } });
    const state = checkoutFiles.create('/w/new', 'system-state', 'empty-directory');
    state.write('AGENTS.md', 'first');
    state.link('CLAUDE.md', 'AGENTS.md');
    expect(
      caught(() => {
        state.write('AGENTS.md', 'second');
      }),
    ).toMatchObject({ message: 'AGENTS.md: already exists; a new repository replaces nothing' });
    expect(
      caught(() => {
        state.link('CLAUDE.md', 'elsewhere');
      }),
    ).toBeInstanceOf(CheckoutPathRefused);
    expect(host.nodes.get('/w/new/AGENTS.md')).toBe('first');
    expect(host.nodes.get('/w/new/CLAUDE.md')).toEqual({ symlink: 'AGENTS.md' });
  });

  test.each([
    [
      { '/w/new/notes.md': 'x', '/w/new/.git/HEAD': 'ref', '/w/new/a/b': 'y' },
      'empty-directory',
      '/w/new holds a, notes.md; a new repository starts in an empty directory, where only .git may exist',
    ],
    [{ '/w/new': 'a file' }, 'empty-directory', '/w/new is not a directory (file)'],
    [{}, 'empty-directory', '/w/new is not a directory (absent)'],
    [
      { '/w/new': { directory: true } },
      'absent',
      '/w/new already exists; a new repository goes where nothing is',
    ],
    [
      { '/w/new': { symlink: 'gone' } },
      'absent',
      '/w/new already exists; a new repository goes where nothing is',
    ],
  ] as const)('%j as %s is refused when created', (tree, place, message) => {
    const { checkoutFiles } = openHost(tree);
    const failure = caught(() => checkoutFiles.create('/w/new', 'system-state', place));
    expect(failure).toBeInstanceOf(CheckoutRootRefused);
    expect(failure).toMatchObject({ message });
  });
});
