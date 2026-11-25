import { describe, expect, test } from 'bun:test';
import { formatRegistry } from '@puni/shared-checkout';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import {
  type CheckHost,
  fixtureCheckRules,
  fixtureVersion,
  openCheckHost,
} from './check.test-host';
import { createRepositoryCheck } from './repository-check.feature';
import { claudeLinksAgents, readmeWords } from './rules/entry.rule';

const track = closeAfterEach();

function openMemoryHost(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  return track(openCheckHost(memoryHost(tree, options).services));
}

const registry = formatRegistry('system-state', fixtureRemotes, 1);

describe('a rule over a memory file system', () => {
  test('CLAUDE.md linking elsewhere is a claude.symlink finding', () => {
    const host = openMemoryHost({
      '/r/puni.json': registry,
      '/r/README.md': 'readme',
      '/r/CLAUDE.md': { symlink: 'README.md' },
    });
    expect(host.judge(claudeLinksAgents, '/r')).toEqual([
      {
        rule: 'claude.symlink',
        path: 'CLAUDE.md',
        message: 'points to README.md, not AGENTS.md',
        remedy: 'recreate the link: ln -sf AGENTS.md CLAUDE.md',
      },
    ]);
  });

  test('a README.md over its budget is a readme.words finding', () => {
    const host = openMemoryHost({ '/r/puni.json': registry, '/r/README.md': 'w '.repeat(151) });
    expect(host.judge(readmeWords, '/r')).toEqual([
      {
        rule: 'readme.words',
        path: 'README.md',
        message: 'has 151 words; at most 150',
        remedy: 'shorten README.md to at most 150 words',
      },
    ]);
  });
});

describe('the repository check turns defect kinds into findings', () => {
  function createCheck(host: CheckHost) {
    const { container } = host;
    return createRepositoryCheck({
      checkoutRegistry: container.resolve('checkoutRegistry'),
      checkoutFiles: container.resolve('checkoutFiles'),
      checkoutProjectScope: container.resolve('checkoutProjectScope'),
      projectSources: container.resolve('projectSources'),
      sourceReaders: container.resolve('sourceReaders'),
      recordsCatalog: container.resolve('recordsCatalog'),
      commandCatalog: { list: () => [] },
      programSource: { directory: '/nowhere', version: fixtureVersion },
      checkRules: fixtureCheckRules(),
    });
  }

  test('an invalid puni.json is one repository.config finding', () => {
    const check = createCheck(openMemoryHost({ '/r/puni.json': '[]' }));
    expect(check.check({}, '/r')).toEqual({
      summary: 'no repository',
      findings: [
        {
          rule: 'repository.config',
          path: 'puni.json',
          message: '/r/puni.json is not a JSON object',
          remedy:
            'correct puni.json as the message says: this-repo-type, rules (the rules epoch), all-repos listing every type once, and optionally map (each partition path to its purpose) and keys starting x-',
        },
      ],
    });
  });

  test.each([{ project: 'two' }, {}])(
    'a git that cannot list the checkout is one repository.git finding: %j',
    (request) => {
      const host = openMemoryHost({ '/r/puni.json': registry }, { gitFailure: 'git exploded' });
      expect(createCheck(host).check(request, '/r').findings).toEqual([
        {
          rule: 'repository.git',
          path: '.',
          message: 'git exploded',
          remedy:
            'make `git ls-files` succeed in the repository: resolve what git reports, such as unmerged entries, then rerun',
        },
      ]);
    },
  );
});
