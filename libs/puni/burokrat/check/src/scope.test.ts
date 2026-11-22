import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findOwner, indexFile, ownsPath, type RepositoryType } from '@puni/shared-checkout';
import { removeFixture, runGit, writeProject, writeRepositoryFile } from '@puni/shared-testing';
import { agentsWordBudget, indexWordBudget, readmeWordBudget } from './budgets';
import { type CheckHost, openCheckHost } from './check.test-host';
import { codeRules } from './rule-set.rule';
import {
  formatFixtureRegistry,
  makeRepository,
  regenerateIndex,
} from './repository-pair.test-host';

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

function openFiles() {
  return host.container.resolve('checkoutFiles').open(root);
}

function listProjects() {
  return host.container.resolve('checkoutProjectScope').list(openFiles());
}

/** The fixture repository with a second project, `two`, and its index regenerated. */
async function makeTwoProjectRepository(): Promise<string> {
  const repository = await makeRepository();
  writeProject(repository, 'libs/two', 'two', {
    readWhen: 'changing two',
    readFirst: 'src/index.ts',
  });
  await regenerateIndex(repository);
  return repository;
}

beforeEach(async () => {
  root = await makeTwoProjectRepository();
});

afterEach(() => {
  removeFixture(root);
});

interface Run {
  readonly code: 0 | 1 | 2;
  readonly findings: readonly string[];
  readonly summary: string;
  readonly errors: string;
}

function runIn(project?: string, repo?: RepositoryType): Run {
  const { code, stdout, stderr } = host.runCheck({ project, repo }, root);
  const lines = stdout.split('\n').filter((line) => line !== '');
  return { code, findings: lines.slice(0, -1), summary: lines.at(-1) ?? '', errors: stderr };
}

const projectNames = ['workspace', 'one', 'two'];
const recordsName = ['demo', 'records'].join('-');

function words(count: number): string {
  return `${'word '.repeat(count)}\n`;
}

/** Defects for every code rule, spread over the root and both projects, in two compatible sets. */
const seeds: readonly (readonly [string, () => void])[] = [
  [
    'entry files, per-file rules and index sources',
    () => {
      writeRepositoryFile(root, 'AGENTS.md', words(agentsWordBudget + 1));
      rmSync(join(root, 'CLAUDE.md'));
      symlinkSync('package.json', join(root, 'CLAUDE.md'));
      rmSync(join(root, 'README.md'));
      writeRepositoryFile(root, 'notes.txt', `see ${recordsName}\n`);
      writeRepositoryFile(root, 'wiki/ops/page.md', 'On 2031-04-05, see [gone](gone.md).\n');
      writeRepositoryFile(
        root,
        'apps/one/NOTES.md',
        'Since 2031-04-05. [here](gone.md) [there](../../libs/two/gone.md) [root](../../gone.md)\n',
      );
      writeProject(root, 'apps/one', 'one', {
        readWhen: 'changing the one app',
        readFirst: 'src/missing.ts',
      });
      writeProject(root, 'libs/two', 'two', {
        readWhen: 'Changing two',
        readFirst: 'src/index.ts',
      });
      writeRepositoryFile(root, 'libs/two/src/index.ts', `export const home = '${recordsName}';\n`);
      writeRepositoryFile(
        root,
        'libs/two/docs/notes.md',
        'See [up](../../../apps/one/x.md) on 2031-04-06.\n',
      );
      writeRepositoryFile(root, indexFile, words(indexWordBudget + 1));
    },
  ],
  [
    'missing AGENTS.md, long README and a stale index',
    () => {
      rmSync(join(root, 'AGENTS.md'));
      writeRepositoryFile(root, 'README.md', words(readmeWordBudget + 1));
      appendFileSync(join(root, indexFile), 'stale');
    },
  ],
];

describe('the union of every project check is the whole check', () => {
  test.each(seeds)('%s', (_name, seed) => {
    seed();
    const whole = runIn();
    const union = projectNames.flatMap((name) => runIn(name).findings).sort();
    expect(whole.code).toBe(1);
    expect(union).toEqual([...whole.findings].sort());
  });

  test('the seeds break every code rule', async () => {
    const broken = new Set<string>();
    for (const [, seed] of seeds) {
      removeFixture(root);
      root = await makeRepository();
      writeProject(root, 'libs/two', 'two', {
        readWhen: 'changing two',
        readFirst: 'src/index.ts',
      });
      seed();
      for (const line of runIn().findings) broken.add(line.split(' ')[0] ?? '');
    }
    expect([...broken].sort()).toEqual(
      [
        'agents.exists',
        'agents.index',
        'claude.symlink',
        'agents.words',
        'history.date',
        'history.records',
        'index.current',
        'index.read-first',
        'index.read-when',
        'index.words',
        'links.resolve',
        'readme.exists',
        'readme.words',
      ].sort(),
    );
    expect(broken.size).toBe(codeRules.length);
  });
});

describe('project ownership', () => {
  test('a file belongs to the deepest enclosing project', () => {
    writeProject(root, 'libs/two/inner', 'inner', {});
    const projects = listProjects();
    expect(findOwner(projects, 'libs/two/inner/x.md')).toBe('libs/two/inner');
    expect(findOwner(projects, 'libs/two/x.md')).toBe('libs/two');
    expect(findOwner(projects, 'libs/twofold/x.md')).toBe('.');
    expect(findOwner(projects, 'README.md')).toBe('.');
  });

  test('a project lists only the files it owns, not a nested project’s', () => {
    writeProject(root, 'libs/two/inner', 'inner', {});
    writeRepositoryFile(root, 'libs/twofold/x.md', 'x');
    const projects = listProjects();
    const two = projects.find((project) => project.name === 'two');
    if (two === undefined) throw new Error('two is not a project');
    const scope = { kind: 'project', project: two, projects } as const;
    const listing = openFiles().listVisible(scope);
    expect(listing).toEqual({
      files: ['libs/two/project.json', 'libs/two/src/index.ts', 'libs/two/tsconfig.json'],
    });
    expect(ownsPath(scope, 'libs/two/inner/src/index.ts')).toBe(false);
  });

  test('a project.json that names no project leaves its files to the enclosing project', () => {
    writeRepositoryFile(root, 'libs/three/project.json', '{}');
    expect(listProjects().map((project) => project.name)).toEqual(['workspace', 'one', 'two']);
  });

  test('two projects with one name are a repository.projects finding', () => {
    writeProject(root, 'libs/three', 'two', {});
    const run = runIn('two');
    expect(run.code).toBe(1);
    expect(run.findings).toEqual([
      'repository.projects libs/two/project.json: project two is named by both libs/three/project.json and libs/two/project.json',
    ]);
  });
});

describe('check --project', () => {
  test('names the project and runs only project-level rules outside the root', () => {
    const projectRules = codeRules.filter((rule) => rule.level === 'project').length;
    expect(runIn('two')).toEqual({
      code: 0,
      findings: [],
      summary: `ok: system-state, project two, ${String(projectRules)} rules, no findings.`,
      errors: '',
    });
    expect(runIn('workspace').summary).toBe(
      `ok: system-state, project workspace, ${String(codeRules.length)} rules, no findings.`,
    );
  });

  test('an unknown project is refused with one error line and exit 2', () => {
    expect(runIn('nope')).toEqual({
      code: 2,
      findings: [],
      summary: '',
      errors: 'error: no project named nope; the projects are workspace, one, two\n',
    });
  });

  test('--project with --repo system-records is refused with exit 2', () => {
    expect(runIn('workspace', 'system-records')).toEqual({
      code: 2,
      findings: [],
      summary: '',
      errors:
        'error: --project needs the system-state repository; system-records is judged whole\n',
    });
  });

  test('--repo system-state is the default spelled out', () => {
    expect(runIn('two', 'system-state')).toEqual(runIn('two'));
  });

  test('without a root project --project is a repository.projects finding', () => {
    rmSync(join(root, 'project.json'));
    expect(runIn('two').findings).toEqual([
      'repository.projects project.json: is missing: --project needs a root project that owns every file no other project owns',
    ]);
  });

  test('a file staged or not gives the same per-project result', () => {
    writeRepositoryFile(root, 'libs/two/notes.md', 'On 2031-04-05.\n');
    const untracked = runIn('two');
    runGit(root, ['add', '-A']);
    expect(untracked.code).toBe(1);
    expect(runIn('two')).toEqual(untracked);
  });

  test('git failing is reported, not a pass', () => {
    writeFileSync(join(root, 'puni.json'), formatFixtureRegistry('system-state'));
    rmSync(join(root, '.git'), { recursive: true });
    const run = runIn('two');
    expect(run.code).toBe(1);
    expect(run.findings[0]).toStartWith('repository.projects .: git ls-files exited 128');
  });
});
