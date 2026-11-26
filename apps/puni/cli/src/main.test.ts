import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWhenRemedy } from '@puni/shared-checkout';
import { readFirstRemedy, scopeRemedy } from '@puni/shared-nx';
import { readInvocation as readProgramInvocation } from '@puni/shared-command';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { createPuniContainer, type PuniContainer } from './composition';
import { type CommandSelection, runProcess, runPuni } from './main';
import { makeStateRepository } from './repository.test-host';
import { puniProgram } from './root-parser';

const scratchDirectories = removeScratchDirectoriesAfterEach();

function readInvocation(args: readonly string[], stdout: (text: string) => void) {
  return readProgramInvocation(puniProgram, args, stdout);
}

let container: PuniContainer;

beforeAll(() => {
  container = createPuniContainer();
});

afterAll(async () => {
  await container.close();
});

function collect(run: (stdout: (text: string) => void) => unknown): string {
  let printed = '';
  run((text) => {
    printed += text;
  });
  return printed;
}

function runIn(
  cwd: string,
  args: readonly string[],
): { code: number; printed: string; errors: string } {
  let code = 0;
  let errors = '';
  const printed = collect((stdout) => {
    code = runPuni(
      args,
      {
        cwd,
        stdout,
        stderr: (text) => {
          errors += text;
        },
      },
      container,
    );
  });
  return { code, printed, errors };
}

describe('runPuni', () => {
  test.each(['navigator', 'dash'] as const)(
    'a bare %s prints its group help and exits 0',
    (group) => {
      expect(runIn('.', [group])).toEqual({
        code: 0,
        printed: collect((stdout) => readInvocation([group, '--help'], stdout)),
        errors: '',
      });
    },
  );

  test.each([
    'burokrat',
    'burokrat wiki',
    'dash ops',
    'navigator plan',
    'navigator research',
    'navigator progress',
    'dash run',
    'dash progress',
    'dash resources',
    'dash release',
    'dash admission',
    'dash authority',
    'dash mcp',
    'dash pool',
    'burokrat repo',
    'burokrat adr',
    'burokrat change',
    'burokrat assess',
    'burokrat review',
    'burokrat skills',
  ])('a bare %s prints its help and exits 0', (line) => {
    const path = line.split(' ');
    expect(runIn('.', path)).toEqual({
      code: 0,
      printed: collect((stdout) => readInvocation([...path, '--help'], stdout)),
      errors: '',
    });
  });

  test('wiki map reads the projects through the composed Nx project source, and no command', () => {
    const root = makeStateRepository(scratchDirectories);
    const map = runIn(root, ['burokrat', 'wiki', 'map']);
    expect(map).toMatchObject({ code: 0, errors: '' });
    expect(map.printed).toContain('- changing the app: `puni burokrat wiki map app`\n');
    expect(map.printed).not.toContain('puni burokrat check');
    expect(runIn(root, ['burokrat', 'wiki', 'map', 'app']).printed).toContain(
      '- changing one: [one](apps/one/src/index.ts)\n',
    );
  });

  test('wiki map refuses defective inputs with one error line and exit 1', () => {
    const root = makeStateRepository(scratchDirectories);
    writeFileSync(join(root, 'apps/one/project.json'), JSON.stringify({ name: 'one' }));
    expect(runIn(root, ['burokrat', 'wiki', 'map'])).toEqual({
      code: 1,
      printed: '',
      errors: `error: apps/one/project.json: project one has no metadata.readWhen; fix: ${readWhenRemedy}; apps/one/project.json: project one metadata.readFirst is missing; fix: ${readFirstRemedy}; apps/one/project.json: project one has no scope:<name> tag; fix: ${scopeRemedy}\n`,
    });
  });

  test('check judges with the live command tree and exits 1 on findings', () => {
    const root = makeStateRepository(scratchDirectories);
    const run = runIn(root, ['burokrat', 'check']);
    expect(run.code).toBe(1);
    expect(run.printed).toContain('agents.exists AGENTS.md: is missing; fix: ');
  });

  test('check --project naming no project exits 2 with one error line', () => {
    const root = makeStateRepository(scratchDirectories);
    writeFileSync(join(root, 'project.json'), JSON.stringify({ name: 'workspace' }));
    expect(runIn(root, ['burokrat', 'check', '--project', 'nope'])).toEqual({
      code: 2,
      printed: '',
      errors: 'error: no project named nope; the projects are workspace, one\n',
    });
  });
});

describe('runPuni tells what the line selected', () => {
  test.each([
    [['burokrat', 'check'], 'burokrat check'],
    [['burokrat'], 'help'],
    [['--version'], 'printed'],
    [['nope'], 'refused'],
  ] as const)('%j selects %s', (args, expected) => {
    const selections: CommandSelection[] = [];
    runPuni(
      args,
      { cwd: '/', stdout: () => undefined, stderr: () => undefined },
      container,
      (selection) => {
        selections.push(selection);
      },
    );
    expect(selections).toEqual([expected]);
  });
});

describe('runProcess', () => {
  test('a command failure and a rejected disposer are reported together, the command first', async () => {
    const commandFailure = new Error('the command failed');
    const closeFailure = new Error('the disposer failed');
    const failing = DiBag.createBuilder()
      .withServices({
        burokratCheckCommand: DiBag.providerWithDisposal({
          provider: () => ({
            run: (): never => {
              throw commandFailure;
            },
          }),
          disposeService: () => Promise.reject(closeFailure),
        }),
        burokratWikiMapCommand: () => ({ run: () => 0 }),
        navigatorPlanAddCommand: () => ({ run: () => 0 }),
        navigatorResearchAddCommand: () => ({ run: () => 0 }),
        burokratRepoInitCommand: () => ({ run: () => 0 }),
        burokratRepoUpgradeCommand: () => ({ run: () => 0 }),
        latestRules: () => ({
          epoch: 1,
          judge: () => ({ 'system-state': [], 'system-records': [] }),
          holdsRulesOf: () => true,
        }),
        burokratAdrAddCommand: () => ({ run: () => 0 }),
        burokratAssessOutcomesCommand: () => ({ run: () => 0 }),
        burokratAssessTemplatesCommand: () => ({ run: () => 0 }),
        burokratReviewFileCommand: () => ({ run: () => 0 }),
        burokratReviewNextCommand: () => ({ run: () => 0 }),
        burokratReviewStartCommand: () => ({ run: () => 0 }),
        burokratReviewSubmitCommand: () => ({ run: () => 0 }),
        burokratSkillsInstallCommand: () => ({ run: () => 0 }),
        dashOpsSshCommand: () => ({ run: () => 0 }),
        dashOpsK3sCommand: () => ({ run: () => 0 }),
        dashRunLogCommand: () => ({ run: () => 0 }),
        dashResourcesCreateCommand: () => ({ run: () => 0 }),
        dashResourcesListCommand: () => ({ run: () => 0 }),
        dashResourcesExecCommand: () => ({ run: () => 0 }),
        dashResourcesRemoveCommand: () => ({ run: () => 0 }),
      })
      .buildContainer();
    const argv = process.argv;
    const exitCode = process.exitCode;
    process.argv = [...argv.slice(0, 2), 'burokrat', 'check'];
    try {
      await rejects(
        runProcess(() => undefined, failing),
        (caught: unknown) =>
          caught instanceof AggregateError &&
          caught.errors[0] === commandFailure &&
          caught.errors[1] instanceof AggregateError &&
          caught.errors[1].errors.includes(closeFailure),
      );
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
    }
  });
});
