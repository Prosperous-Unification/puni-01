import { afterEach, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { type MemoryTree, memoryHost } from '@puni/shared-testing';
import { type CheckHost, openCheckHost } from './check.test-host';
import { createRepositoryCheck } from './repository-check.feature';
import { claudeLinksAgents, readmeWords } from './rules/entry.rule';

const hosts: CheckHost[] = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close();
});

function openMemoryHost(tree: MemoryTree, options: Parameters<typeof memoryHost>[1] = {}) {
  const host = openCheckHost(memoryHost(tree, options).services);
  hosts.push(host);
  return host;
}

const registry = JSON.stringify({
  'this-repo-type': 'system-state',
  'all-repos': [
    { type: 'system-state', remote: { type: 'github', url: 'https://github.com/acme/demo' } },
    {
      type: 'system-records',
      remote: { type: 'github', url: 'https://github.com/acme/demo-records' },
    },
  ],
});

describe('a rule over a memory file system', () => {
  test('CLAUDE.md linking elsewhere is a claude.symlink finding', () => {
    const host = openMemoryHost({
      '/r/puni.json': registry,
      '/r/README.md': 'readme',
      '/r/CLAUDE.md': { symlink: 'README.md' },
    });
    expect(host.judge(claudeLinksAgents, '/r')).toEqual([
      { rule: 'claude.symlink', path: 'CLAUDE.md', message: 'points to README.md, not AGENTS.md' },
    ]);
  });

  test('a README.md over its budget is a readme.words finding', () => {
    const host = openMemoryHost({ '/r/puni.json': registry, '/r/README.md': 'w '.repeat(151) });
    expect(host.judge(readmeWords, '/r')).toEqual([
      { rule: 'readme.words', path: 'README.md', message: 'has 151 words; at most 150' },
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
      checkoutWikiIndex: container.resolve('checkoutWikiIndex'),
      recordsCatalog: container.resolve('recordsCatalog'),
      commandCatalog: { list: () => [] },
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
        },
      ],
    });
  });

  test('projects git cannot list are one repository.projects finding', () => {
    const host = openMemoryHost({ '/r/puni.json': registry }, { gitFailure: 'git exploded' });
    expect(createCheck(host).check({ project: 'two' }, '/r')).toEqual({
      summary: 'system-state',
      findings: [{ rule: 'repository.projects', path: '.', message: 'git exploded' }],
    });
  });

  test('anything that is not a defect kind propagates', () => {
    const host = openMemoryHost({ '/r/puni.json': registry, '/r/AGENTS.md': { directory: true } });
    throws(() => createCheck(host).check({}, '/r'), /ENOENT/u);
  });
});
