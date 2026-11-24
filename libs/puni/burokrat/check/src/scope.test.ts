import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findOwner, formatRegistry, ownsPath, type RepositoryType } from '@puni/shared-checkout';
import {
  FixtureGitFailed,
  fixtureRemotes,
  removeScratchDirectoriesAfterEach,
  runGit,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { agentsWordBudget, pageWordBudget, readmeWordBudget } from './budgets';
import { type CheckHost, openCheckHost } from './check.test-host';
import { appliesAt } from './finding';
import { codeRules, crossProjectRules, latestRulesEpoch } from './rule-set.rule';
import { credentialSamples, forbiddenAddress } from './secrets.test-host';
import { fixturePurposes, makeRepository } from './repository-pair.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

function openFiles() {
  return host.container.resolve('checkoutFiles').open(root, 'system-state');
}

function listProjects() {
  return host.container.resolve('checkoutProjectScope').list(openFiles());
}

/** The rules epoch the fixture repository is pinned at: the latest, unless a test walks another. */
let pin = latestRulesEpoch;

/** The fixture repository pinned at {@link pin}, with a second project, `two`. */
function makeTwoProjectRepository(): string {
  const repository = makeRepository(scratchDirectories, pin);
  writeProject(repository, 'libs/two', 'two', {
    readWhen: 'changing two',
    readFirst: 'src/index.ts',
  });
  return repository;
}

beforeEach(() => {
  pin = latestRulesEpoch;
  root = makeTwoProjectRepository();
});

interface Run {
  readonly code: number;
  readonly findings: readonly string[];
  readonly summary: string;
  readonly errors: string;
}

function runIn(project?: string, repo?: RepositoryType, crossProjectLinks?: boolean): Run {
  const { code, stdout, stderr } = host.runCheck({ project, repo, crossProjectLinks }, root);
  const lines = stdout.split('\n').filter((line) => line !== '' && !line.startsWith('newer: '));
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
    'entry files, per-file rules and map sources',
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
        'Since 2031-04-05. [here](gone.md) [there](../../libs/two/gone.md) [root](../../gone.md) [`a`](src/head.ts#b)\n',
      );
      writeProject(root, 'apps/one', 'one', {
        readWhen: 'changing the one app',
        readFirst: 'src/missing.ts',
      });
      writeProject(root, 'libs/two', 'two', {
        readWhen: 'Changing two',
        readFirst: 'src/index.ts',
      });
      writeRepositoryFile(
        root,
        'libs/two/src/index.ts',
        `/** Home, after {@link gone}: \`apps/one/gone.ts\`, \`bun run nope\`. */\nexport const home = '${recordsName}';\n`,
      );
      writeRepositoryFile(
        root,
        'libs/two/docs/notes.md',
        'See [up](../../../apps/one/x.md) on 2031-04-06.\n',
      );
      writeProject(
        root,
        'libs/three',
        'three',
        { readWhen: 'changing three', readFirst: 'src/index.ts' },
        'Three',
      );
      writeRepositoryFile(root, 'libs/two/src/key.ts', `${credentialSamples[0]?.[1] ?? ''}\n`);
      writeRepositoryFile(root, 'libs/two/hosts.txt', `${forbiddenAddress}\n`);
      writeRepositoryFile(root, 'apps/one/src/head.ts', '// The one app.\n\nexport const a = 1;\n');
      writeRepositoryFile(root, 'apps/one/tsconfig.json', '{}');
      writeRepositoryFile(
        root,
        'wiki/ops/tools.md',
        'Use `apps/one/gone.ts`, `wiki/gone.md`, `bun run nope`, `demo burokrat nope` and `goneSymbol`, [`home`](../../libs/two/src/index.ts#gone) and [options](../../apps/one/tsconfig.json#strict).\n',
      );
      writeRepositoryFile(
        root,
        'wiki/how-to/long.md',
        `---\ntitle: Long\nread-when: reading long\n---\n\n${'word '.repeat(pageWordBudget)}\n`,
      );
      rmSync(join(root, '.github'), { recursive: true });
      symlinkSync('/nowhere/absolute', join(root, 'libs/two/far'));
      symlinkSync('../../../outside', join(root, 'apps/one/out'));
      symlinkSync('gone.md', join(root, 'apps/one/near'));
      symlinkSync('../../apps/one/gone.md', join(root, 'libs/two/across'));
      runGit(root, ['add', 'libs/two/far', 'apps/one/out', 'apps/one/near', 'libs/two/across']);
      runGit(root, [
        'update-index',
        '--add',
        '--cacheinfo',
        `160000,${'1'.repeat(40)},libs/two/vendor`,
      ]);
    },
  ],
  [
    'missing AGENTS.md, long README, a crowded partition and an unused purpose',
    () => {
      rmSync(join(root, 'AGENTS.md'));
      writeRepositoryFile(root, 'README.md', words(readmeWordBudget + 1));
      writeRepositoryFile(root, 'wiki/index/index.md', '# Wiki index\n');
      for (const index of Array.from({ length: 20 }, (_, at) => String(at))) {
        writeProject(root, `libs/many${index}`, `many${index}`, {
          readWhen: `changing ${'many '.repeat(18)}things`,
          readFirst: 'src/index.ts',
        });
      }
      const purposes = new Map([...fixturePurposes, ['navigator', 'planning the work']]);
      writeRepositoryFile(
        root,
        'puni.json',
        formatRegistry('system-state', fixtureRemotes, pin, purposes),
      );
    },
  ],
  [
    'AGENTS.md giving no records location, with a section puni does not declare',
    () => {
      writeRepositoryFile(
        root,
        'AGENTS.md',
        'Start at `puni burokrat wiki map`.\n\n## Exceptions\n\nNone.\n',
      );
    },
  ],
];

describe.each([2, latestRulesEpoch])(
  'at pin %d, every project check and the cross-project check are the whole check',
  (at) => {
    beforeEach(() => {
      pin = at;
      root = makeTwoProjectRepository();
    });

    test.each(seeds)('%s', (_name, seed) => {
      seed();
      const whole = runIn();
      const union = [
        ...projectNames.flatMap((name) => runIn(name).findings),
        ...runIn(undefined, undefined, true).findings,
      ].sort();
      expect(whole.code).toBe(1);
      expect(union).toEqual([...whole.findings].sort());
    });

    test('each part finds something the others do not', () => {
      for (const [, seed] of seeds) seed();
      const cross = runIn(undefined, undefined, true).findings;
      const projects = projectNames.flatMap((name) => runIn(name).findings);
      expect(cross.length).toBeGreaterThan(0);
      expect(cross.filter((line) => projects.includes(line))).toEqual([]);
    });

    test('the seeds break every code rule', () => {
      const broken = new Set<string>();
      for (const [, seed] of seeds) {
        root = makeTwoProjectRepository();
        seed();
        for (const line of runIn().findings) broken.add(line.split(' ')[0] ?? '');
      }
      expect([...broken].sort()).toEqual(
        [
          'agents.exists',
          'agents.headings',
          'agents.index',
          'claude.symlink',
          'agents.words',
          'history.date',
          'history.records',
          'index.purpose',
          'index.leftover',
          'index.read-first',
          'index.read-when',
          'index.scope',
          'index.section',
          'index.words',
          'links.resolve',
          'readme.exists',
          'readme.words',
          'secrets.plaintext',
          'project.targets',
          'docs.paths',
          'docs.commands',
          ...(at < 3 ? ['docs.symbols'] : ['docs.references', 'docs.spans', 'docs.comment-links']),
          'docs.words',
          'agents.records',
          'ci.gate',
          'agents.rules',
          'secrets.addresses',
          'code.header',
          'entries.kind',
        ].sort(),
      );
      expect(broken).toEqual(
        new Set(codeRules.filter(({ rule }) => appliesAt(rule, at)).map(({ rule }) => rule.id)),
      );
    });
  },
);

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
    expect(listing).toEqual([
      'libs/two/project.json',
      'libs/two/src/index.ts',
      'libs/two/tsconfig.json',
    ]);
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
      'repository.projects libs/two/project.json: project two is named by both libs/three/project.json and libs/two/project.json; fix: rename the project in libs/two/project.json; every project name is unique',
    ]);
  });
});

describe('check --project', () => {
  test('names the project and runs only project-level rules outside the root', () => {
    const pinned = codeRules.filter(({ rule }) => appliesAt(rule, pin));
    const projectRules = pinned.filter(({ level }) => level === 'project').length;
    const rootRules = pinned.length;
    expect(runIn('two')).toEqual({
      code: 0,
      findings: [],
      summary: `ok: system-state, project two, ${String(projectRules)} rules, no findings.`,
      errors: '',
    });
    expect(runIn('workspace').summary).toBe(
      `ok: system-state, project workspace, ${String(rootRules)} rules, no findings.`,
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

  test('--cross-project-links runs the reference rules over every file', () => {
    expect(runIn(undefined, undefined, true)).toEqual({
      code: 0,
      findings: [],
      summary: `ok: system-state, cross-project links, ${String(crossProjectRules.filter((rule) => appliesAt(rule, pin)).length)} rules, no findings.`,
      errors: '',
    });
  });

  test('--cross-project-links with --repo system-records or --project is refused with exit 2', () => {
    expect(runIn(undefined, 'system-records', true).errors).toBe(
      'error: --cross-project-links needs the system-state repository; system-records is judged whole\n',
    );
    expect(runIn('two', undefined, true)).toEqual({
      code: 2,
      findings: [],
      summary: '',
      errors:
        'error: --project and --cross-project-links each choose what to judge; give at most one\n',
    });
  });

  test('a link from one project to a missing file of another fails only the cross-project check', () => {
    writeRepositoryFile(root, 'libs/two/README.md', 'See [one](../../apps/one/gone.md).\n');
    expect(runIn('two').code).toBe(0);
    expect(runIn(undefined, undefined, true).findings).toEqual([
      'links.resolve libs/two/README.md: links to missing ../../apps/one/gone.md; fix: point the link at a path that exists, or remove it',
    ]);
  });

  test('--repo system-state is the default spelled out', () => {
    expect(runIn('two', 'system-state')).toEqual(runIn('two'));
  });

  test('without a root project --project is a repository.projects finding', () => {
    rmSync(join(root, 'project.json'));
    expect(runIn('two').findings).toEqual([
      'repository.projects project.json: is missing: --project needs a root project that owns every file no other project owns; fix: add a project.json at the root naming the root project',
    ]);
  });

  test('a file staged or not gives the same per-project result', () => {
    writeRepositoryFile(root, 'libs/two/notes.md', 'On 2031-04-05.\n');
    const untracked = runIn('two');
    runGit(root, ['add', '-A']);
    expect(untracked.code).toBe(1);
    expect(runIn('two')).toEqual(untracked);
  });

  test('git failing is the one repository.git finding, not a pass', () => {
    writeFileSync(join(root, 'puni.json'), formatRegistry('system-state', fixtureRemotes, 1));
    rmSync(join(root, '.git'), { recursive: true });
    const run = runIn('two');
    expect(run.code).toBe(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]).toStartWith('repository.git .: git ls-files exited 128');
  });
});

describe('check --staged', () => {
  test('judges the staged text for secrets, not the working tree', () => {
    const sample = credentialSamples[2]?.[1] ?? '';
    writeRepositoryFile(root, 'libs/two/src/env.ts', `${sample}\n`);
    runGit(root, ['add', 'libs/two/src/env.ts']);
    writeRepositoryFile(root, 'libs/two/src/env.ts', 'export {};\n');
    const run = host.runCheck({ staged: true }, root);
    expect(run.code).toBe(1);
    expect(run.stdout).toBe(
      'secrets.plaintext libs/two/src/env.ts: line 1 holds what looks like a GitHub token; fix: remove the credential from the file, rotate it, and read it from the environment or a secret store\nfail: system-state, staged files, 2 rules, 1 finding.\n',
    );
    expect(host.runCheck({}, root).code).toBe(0);
  });

  test('judges a staged address too', () => {
    writeRepositoryFile(root, 'libs/two/hosts.txt', `host ${forbiddenAddress}\n`);
    runGit(root, ['add', 'libs/two/hosts.txt']);
    expect(host.runCheck({ staged: true }, root).stdout).toBe(
      "secrets.addresses libs/two/hosts.txt: line 1 holds an IPv4 address; fix: move the address to the operator's SSH configuration or the records repository and name the host by its SSH alias; a test uses 192.0.2.0/24\nfail: system-state, staged files, 2 rules, 1 finding.\n",
    );
  });

  test('a clean index passes with the two secret rules', () => {
    expect(host.runCheck({ staged: true }, root).stdout).toBe(
      'ok: system-state, staged files, 2 rules, no findings.\n',
    );
  });
});

describe('an index with unmerged entries', () => {
  test('is the one repository.git finding, never a pass', () => {
    const git = (...args: string[]): void => {
      runGit(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
    };
    git('commit', '-qm', 'base');
    git('switch', '-qc', 'side');
    writeRepositoryFile(root, 'README.md', '# side\n');
    git('commit', '-qam', 'side');
    git('switch', '-q', '-');
    writeRepositoryFile(root, 'README.md', '# main\n');
    git('commit', '-qam', 'main');
    throws(() => {
      git('merge', '-q', 'side');
    }, FixtureGitFailed);
    const run = runIn();
    expect(run.code).toBe(1);
    expect(run.findings).toEqual([
      'repository.git .: the git index has unmerged entries: README.md; fix: make `git ls-files` succeed in the repository: resolve what git reports, such as unmerged entries, then rerun',
    ]);
  });
});
