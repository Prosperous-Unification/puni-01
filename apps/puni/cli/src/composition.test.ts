import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { closeAfterEach, memoryHost } from '@puni/shared-testing';
import { createPuniContainer } from './composition';
import { type CommandContainer, runPuni } from './main';

const exportedKeys = [
  'burokratAdrAddCommand',
  'burokratAssessOutcomesCommand',
  'burokratAssessTemplatesCommand',
  'burokratCheckCommand',
  'burokratRepoInitCommand',
  'burokratRepoUpgradeCommand',
  'burokratReviewFileCommand',
  'burokratReviewNextCommand',
  'burokratReviewStartCommand',
  'burokratReviewSubmitCommand',
  'burokratSkillsInstallCommand',
  'burokratWikiMapCommand',
  'checkoutFiles',
  'checkoutProjectScope',
  'checkoutRegistry',
  'clock',
  'commandCatalog',
  'dashOpsK3sCommand',
  'dashOpsSshCommand',
  'dashResourcesCreateCommand',
  'dashResourcesExecCommand',
  'dashResourcesListCommand',
  'dashResourcesRemoveCommand',
  'dashRunLogCommand',
  'fileSystem',
  'git',
  'latestRules',
  'navigatorPlanAddCommand',
  'navigatorResearchAddCommand',
  'nxProjectSource',
  'processRunner',
  'programSource',
  'projectSources',
  'recordFiling',
  'recordsCatalog',
  'reviewTemplates',
  'workingTreeDigest',
] as const;

const track = closeAfterEach();

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
        ['fileSystem', 'git', 'processRunner', 'clock'],
        host.services,
      ),
    );
    expect(runIn(container, '/work', ['burokrat', 'check'])).toEqual({
      code: 1,
      stdout:
        'repository.root .: no puni.json in /work or any directory above it; run puni from the system-state repository, which holds puni.json; fix: run puni from the system-state repository or a directory in it\nfail: no repository, 1 finding.\n',
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
          stat: () => {
            throw failure;
          },
        }),
      }),
    );
    throws(
      () => runIn(container, '/work', ['burokrat', 'check']),
      (caught) => caught === failure,
    );
  });
});
