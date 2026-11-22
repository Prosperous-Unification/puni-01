import { afterEach, describe, expect, test } from 'bun:test';
import { memoryHost } from '@puni/shared-testing';
import { createPuniContainer } from './composition';
import { type CommandContainer, runPuni } from './main';

const exportedKeys = [
  'burokratCheckCommand',
  'burokratWikiIndexCommand',
  'checkoutFiles',
  'checkoutProjectScope',
  'checkoutRegistry',
  'checkoutWikiIndex',
  'commandCatalog',
  'fileSystem',
  'git',
  'processRunner',
  'recordsCatalog',
] as const;

const containers: { close(): Promise<void> }[] = [];

function track<Tracked extends { close(): Promise<void> }>(container: Tracked): Tracked {
  containers.push(container);
  return container;
}

afterEach(async () => {
  for (const container of containers.splice(0).reverse()) await container.close();
});

function runIn(container: CommandContainer, cwd: string, args: readonly string[]) {
  let stdout = '';
  let stderr = '';
  const code = runPuni(
    args,
    {
      cwd,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
    container,
  );
  return { code, stdout, stderr };
}

describe('the puni container', () => {
  test('resolves every exported key, which are exactly these', () => {
    const container = track(createPuniContainer());
    const listed = container
      .graphSnapshot()
      .bindings.flatMap((binding) => binding.serviceKeys)
      .filter((key) => typeof key === 'string')
      .sort();
    expect(listed).toEqual([...exportedKeys]);
    for (const key of exportedKeys) expect(container.resolve(key)).toBeDefined();
  });

  test('runs a command over a memory host put in place of the machine', () => {
    const host = memoryHost({ '/work/notes.md': 'no registry here' });
    const container = track(
      track(createPuniContainer()).createIndependentContainer(
        ['fileSystem', 'git', 'processRunner'],
        host.services,
      ),
    );
    expect(runIn(container, '/work', ['burokrat', 'check'])).toEqual({
      code: 1,
      stdout:
        'repository.root .: no puni.json in /work or any directory above it; run puni from the system-state repository, which holds puni.json\nfail: no repository, 1 finding.\n',
      stderr: '',
    });
  });

  test('an unexpected failure inside a command propagates unchanged', () => {
    const failure = new Error('disk on fire');
    const host = memoryHost({ '/work/puni.json': '{}' });
    const container = track(
      track(createPuniContainer()).createIndependentContainer(['fileSystem'], {
        fileSystem: () => ({
          ...host.services.fileSystem(),
          readText: () => {
            throw failure;
          },
        }),
      }),
    );
    expect(() => runIn(container, '/work', ['burokrat', 'check'])).toThrow(failure);
  });
});
