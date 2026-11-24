import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { removeScratchDirectoriesAfterEach, writeRepositoryFile } from '@puni/shared-testing';
import { type CheckHost, dropRemedies, openCheckHost } from './check.test-host';
import { listUnlinkedCode, readSymbolSpan } from './docs';
import { makeRepository, writeEpochFiles } from './repository-pair.test-host';
import { appliesAt } from './finding';
import { codeRules, latestRulesEpoch } from './rule-set.rule';
import { judgeDocLinks, judgeDocReferences, judgeDocSpans } from './rules/references.rule';

describe('readSymbolSpan', () => {
  test.each([
    ['renderRootMap', 'renderRootMap'],
    ['CommandExitCode', 'CommandExitCode'],
    ['PUNI_FAILURE_REPORT', 'PUNI_FAILURE_REPORT'],
    ['listCommands()', 'listCommands'],
    ['CheckRules.sets', 'CheckRules.sets'],
    ['ResourceWorktreesResource.list', 'ResourceWorktreesResource.list'],
  ])('%s names the symbol %s', (span, symbol) => {
    expect(readSymbolSpan(span)).toBe(symbol);
  });

  test.each([
    'index',
    'Rule',
    'README',
    'CLAUDE.md',
    'puni.json',
    'render-map.ts',
    'renderMap.ts',
    'metadata.readWhen',
    'process.exitCode',
    'libs/puni/shared/checkout/src/contract.ts',
    'bun run gate',
    'puni burokrat check',
    '--cross-project-links',
    'scope:shared',
    'Foo<Bar>',
    'parse(text)',
    'x-notes',
    '@puni/shared-checkout',
    '',
  ])('%s names no symbol', (span) => {
    expect(readSymbolSpan(span)).toBeUndefined();
  });
});

describe('listUnlinkedCode', () => {
  test('reads spans outside links and fences only', () => {
    const text = [
      'Use `a` and [`b`](x.ts#b), [the `c` one](y.md), then `d`.',
      '```',
      '`e`',
      '```',
    ].join('\n');
    expect(listUnlinkedCode(text)).toEqual(['a', 'd']);
  });
});

const scratchDirectories = removeScratchDirectoriesAfterEach();
let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(() => {
  root = makeRepository(scratchDirectories, latestRulesEpoch);
  writeRepositoryFile(
    root,
    'libs/x/src/box.ts',
    "import { join } from 'node:path';\n\nexport class Box {\n  size = 1;\n}\n\nexport { join as joined };\n",
  );
});

describe('docs.references', () => {
  test('accepts a member, a re-export and Markdown heading anchors, and leaves missing files to links.resolve', () => {
    writeRepositoryFile(
      root,
      'wiki/how-to/box.md',
      '# Box\n\n[`Box.size`](../../libs/x/src/box.ts#Box.size), [`joined`](../../libs/x/src/box.ts#joined), [here](#box), [nowhere](../../libs/x/src/gone.ts#Gone), [all](../../libs/x/src/box.ts)\n',
    );
    expect(host.judge(judgeDocReferences, root)).toEqual([]);
  });

  test('judges a link in any Markdown file, a name only as declared', () => {
    writeRepositoryFile(root, 'libs/x/NOTES.md', '[`size`](src/box.ts#size)\n');
    expect(dropRemedies(host.judge(judgeDocReferences, root))).toEqual([
      {
        rule: 'docs.references',
        path: 'libs/x/NOTES.md',
        message: 'links to src/box.ts#size, but libs/x/src/box.ts declares no size',
      },
    ]);
  });

  test('names a file without an extension as such', () => {
    writeRepositoryFile(root, 'Makefile', 'all:\n');
    writeRepositoryFile(root, 'wiki/make.md', '[all](../Makefile#all)\n');
    expect(dropRemedies(host.judge(judgeDocReferences, root))).toEqual([
      {
        rule: 'docs.references',
        path: 'wiki/make.md',
        message:
          'links to ../Makefile#all, but no source reader reads a file without an extension, so the fragment names nothing',
      },
    ]);
  });
});

describe('docs.spans', () => {
  test('judges only documentation, each symbol of a file once', () => {
    writeRepositoryFile(root, 'libs/x/NOTES.md', 'Call `renderIndex`.\n');
    writeRepositoryFile(root, 'wiki/a.md', 'Call `renderIndex`, then `renderIndex` again.\n');
    expect(dropRemedies(host.judge(judgeDocSpans, root))).toEqual([
      {
        rule: 'docs.spans',
        path: 'wiki/a.md',
        message: 'names the symbol renderIndex without linking it',
      },
    ]);
  });
});

describe('docs.comment-links', () => {
  test('accepts declared, imported and member names in each link form; judges no comment of a file no reader reads', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/use.ts',
      "import { joined } from './box';\n\n/** {@link joined}, {@linkcode Local|text}, {@linkplain Local#field the field}, {@link Local.field}. */\nexport interface Local {\n  field: string;\n}\n",
    );
    writeRepositoryFile(root, 'libs/x/src/notes.txt', '/** {@link gone} */\n');
    expect(host.judge(judgeDocLinks, root)).toEqual([]);
  });

  test('judges a link in a nested doc comment by the scope of the file', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/inner.js',
      'export function outer(tree) {\n  /** Walks {@link tree}. */\n  return tree;\n}\n',
    );
    expect(dropRemedies(host.judge(judgeDocLinks, root))).toEqual([
      {
        rule: 'docs.comment-links',
        path: 'libs/x/src/inner.js',
        message: 'doc comment at line 2 links {@link tree}, but tree is not in scope',
      },
    ]);
  });
});

describe('the epoch contract', () => {
  test('what epoch 3 refuses still passes at pin 2, and is named as newer there', () => {
    writeRepositoryFile(
      root,
      'libs/x/src/use.ts',
      '/** Runs `bin/deploy.sh` and `bun run nope`, after {@link gone}. */\nexport const use = 1;\n',
    );
    writeRepositoryFile(root, 'config/a.json', '{ "key": 1 }\n');
    writeRepositoryFile(
      root,
      'wiki/use.md',
      '---\ntitle: Use\nread-when: using the box\n---\n\n# Use\n\nCall `joinPaths` from [`Box`](../libs/x/src/box.ts#Gone) or [key](../config/a.json#key).\n',
    );
    writeRepositoryFile(root, 'libs/x/src/paths.ts', 'export const joinPaths = 1;\n');
    writeEpochFiles(root, 2);
    const atTwo = host.runCheck({}, root);
    expect([atTwo.code, atTwo.stderr, atTwo.stdout.split('\n')[0]]).toEqual([
      0,
      '',
      `ok: system-state, ${String(codeRules.filter(({ rule }) => appliesAt(rule, 2)).length)} rules, no findings.`,
    ]);
    writeEpochFiles(root, 3);
    expect(
      host
        .runCheck({}, root)
        .stdout.split('\n')
        .map((line) => line.split(' ')[0])
        .filter((id) => id !== '' && id !== 'fail:'),
    ).toEqual([
      'docs.commands',
      'docs.comment-links',
      'docs.paths',
      'docs.references',
      'docs.references',
      'docs.spans',
    ]);
  });
});
