import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import syncWikiIndex from './wiki-index.cjs';

/** The part of an Nx tree the generator uses, over a map of files. */
function makeTree(files: Record<string, string>, root = '/nowhere') {
  const tree = new Map(Object.entries(files));
  return {
    files: tree,
    root,
    exists: (path: string) =>
      tree.has(path) || [...tree.keys()].some((key) => key.startsWith(`${path}/`)),
    read: (path: string) => tree.get(path) ?? null,
    write: (path: string, text: string) => {
      tree.set(path, text);
    },
    delete: (path: string) => {
      tree.delete(path);
    },
    isFile: (path: string) => tree.has(path),
    children: (directory: string) => [
      ...new Set(
        [...tree.keys()]
          .filter((key) => key.startsWith(`${directory}/`))
          .map((key) => key.slice(directory.length + 1).split('/')[0] ?? ''),
      ),
    ],
  };
}

describe('the wiki index sync generator', () => {
  test('writes what differs and deletes every other file below wiki/index', () => {
    const tree = makeTree({
      'wiki/index/index.md': 'stale',
      'wiki/index/notes.md': 'hand-made',
      'wiki/index/deep/old.md': 'old',
      'wiki/page.md': 'kept',
    });
    const outcome = syncWikiIndex.syncIndex(
      tree,
      JSON.stringify({ 'wiki/index/index.md': 'fresh' }),
    );
    expect(Object.fromEntries(tree.files)).toEqual({
      'wiki/index/index.md': 'fresh',
      'wiki/page.md': 'kept',
    });
    expect(outcome.outOfSyncMessage).toBe(
      'wiki/index/index.md is stale; wiki/index/notes.md is not generated; wiki/index/deep/old.md is not generated; run `bun run fix`',
    );
  });

  test('leaves a current index untouched', () => {
    const tree = makeTree({ 'wiki/index/index.md': 'fresh' });
    let writes = 0;
    const counting = { ...tree, write: () => (writes += 1) };
    syncWikiIndex.syncIndex(counting, JSON.stringify({ 'wiki/index/index.md': 'fresh' }));
    expect(writes).toBe(0);
  });

  test('refuses printed output that is not files of wiki/index', () => {
    const tree = makeTree({});
    throws(() => syncWikiIndex.syncIndex(tree, '[]'), /printed no JSON object/u);
    throws(
      () => syncWikiIndex.syncIndex(tree, JSON.stringify({ 'README.md': 'x' })),
      /printed README\.md, not a file of wiki\/index\//u,
    );
  });

  test('a failing command throws naming it and its error, so sync:check cannot pass', async () => {
    const root = mkdtempSync(join(tmpdir(), 'puni-nx-sync-'));
    let failure: unknown;
    try {
      await syncWikiIndex(makeTree({}, root));
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(
      'bun apps/puni/cli/src/entrypoint.ts burokrat wiki index --print failed: ',
    );
  });
});
