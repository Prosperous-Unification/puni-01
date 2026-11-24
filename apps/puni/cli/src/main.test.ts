import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceDefectRemedies } from '@puni/shared-checkout';
import { readInvocation as readProgramInvocation } from '@puni/shared-command';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { createPuniContainer, type PuniContainer } from './composition';
import { type CommandSelection, runProcess, runPuni } from './main';
import { makeStateRepository } from './repository.test-host';
import { puniProgram } from './root-parser';

const scratch = removeScratchDirectoriesAfterEach();

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
  ])('a bare %s prints its help and exits 0', (line) => {
    const path = line.split(' ');
    expect(runIn('.', path)).toEqual({
      code: 0,
      printed: collect((stdout) => readInvocation([...path, '--help'], stdout)),
      errors: '',
    });
  });

  test('wiki index partitions the live command tree by role, projects by scope', () => {
    const root = makeStateRepository(scratch);
    const written = ['app', 'burokrat', 'dash', 'index', 'navigator'];
    expect(runIn(root, ['burokrat', 'wiki', 'index'])).toEqual({
      code: 0,
      printed: written.map((name) => `wrote: wiki/index/${name}.md\n`).join(''),
      errors: '',
    });
    const read = (name: string) => readFileSync(join(root, `wiki/index/${name}.md`), 'utf8');
    expect(read('index')).toContain('- `puni burokrat`: ');
    expect(read('index')).not.toContain('- `puni burokrat check`: ');
    expect(read('index')).toContain('- [dash](dash.md): ');
    expect(read('app')).toContain('- changing one: [one](../../apps/one/src/index.ts)\n');
    expect(read('burokrat')).toContain('- `puni burokrat check`: ');
    expect(read('dash')).toContain('- `puni dash release`: ');
    expect(read('navigator')).toContain('- `puni navigator research`: ');
  });

  test('wiki index refuses defective inputs with one error line and exit 1', () => {
    const root = makeStateRepository(scratch);
    writeFileSync(join(root, 'apps/one/project.json'), JSON.stringify({ name: 'one' }));
    expect(runIn(root, ['burokrat', 'wiki', 'index'])).toEqual({
      code: 1,
      printed: '',
      errors: `error: apps/one/project.json: project one has no metadata.readWhen; fix: ${sourceDefectRemedies['read-when']}; apps/one/project.json: project one metadata.readFirst is missing; fix: ${sourceDefectRemedies['read-first']}; apps/one/project.json: project one has no scope:<name> tag; fix: ${sourceDefectRemedies.scope}\n`,
    });
  });

  test('check judges with the live command tree and exits 1 on findings', () => {
    const root = makeStateRepository(scratch);
    const run = runIn(root, ['burokrat', 'check']);
    expect(run.code).toBe(1);
    expect(run.printed).toContain('agents.exists AGENTS.md: is missing; fix: ');
    expect(run.printed).toContain('index.current wiki/index/index.md: is missing');
  });

  test('check --project naming no project exits 2 with one error line', () => {
    const root = makeStateRepository(scratch);
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
        burokratWikiIndexCommand: () => ({ run: () => 0 }),
        navigatorPlanAddCommand: () => ({ run: () => 0 }),
        navigatorResearchAddCommand: () => ({ run: () => 0 }),
        burokratRepoInitCommand: () => ({ run: () => 0 }),
        burokratAdrAddCommand: () => ({ run: () => 0 }),
        burokratAssessOutcomesCommand: () => ({ run: () => 0 }),
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
