import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutModule, formatRegistry, readWhenRemedy } from '@puni/shared-checkout';
import { type NxExports, nxModule, readFirstRemedy } from '@puni/shared-nx';
import {
  fixtureRemotes,
  nodeHostModule,
  removeScratchDirectoriesAfterEach,
  writeProject,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { burokratWikiModule } from './module';
import { formatFixtureRegistry, makeRepository } from './wiki.test-host';

let root = '';

const container = DiBag.createBuilder()
  .withInstalledModules([nodeHostModule, checkoutModule, nxModule, burokratWikiModule])
  .withServices({ projectSources: ({ nxProjectSource }: NxExports) => [nxProjectSource] })
  .buildContainer();

afterAll(async () => {
  await container.close();
});

function runMap(partition?: string, cwd = root) {
  let stdout = '';
  let stderr = '';
  const code = container.resolve('burokratWikiMapCommand').run(
    { kind: 'wiki map', partition },
    {
      cwd,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
  );
  return { code, stdout, stderr };
}

/** Every path below `directory`, recursively, `.git` left out. */
function listTree(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((path) => !path.startsWith('.git'))
    .sort();
}

const scratchDirectories = removeScratchDirectoriesAfterEach();

beforeEach(() => {
  root = makeRepository(scratchDirectories);
});

describe('the wiki map command', () => {
  test('from a nested directory it prints the root of the map and writes nothing', () => {
    const before = listTree(root);
    expect(runMap(undefined, join(root, 'apps/one/src'))).toEqual({
      code: 0,
      stdout: [
        '# Wiki map',
        '',
        '## Read when',
        '',
        '- the gate fails: [Gate](wiki/gate.md)',
        '',
        '## Partitions',
        '',
        '- changing the app: `puni burokrat wiki map app`',
        '',
      ].join('\n'),
      stderr: '',
    });
    expect(listTree(root)).toEqual(before);
  });

  test('a partition prints its projects, linking each file to read first from the root', () => {
    expect(runMap('app')).toEqual({
      code: 0,
      stdout: [
        '# Wiki map: app',
        '',
        'Read this when changing the app.',
        '',
        '## Read when',
        '',
        '- changing the one app: [one](apps/one/src/index.ts)',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  test('a repository whose package.json has a puni script prints its commands through bun run', () => {
    writeRepositoryFile(root, 'package.json', JSON.stringify({ scripts: { puni: 'bun x.ts' } }));
    expect(runMap().stdout).toContain('- changing the app: `bun run puni burokrat wiki map app`\n');
  });

  test('a partition the map does not show is refused with exit 2, naming those it does', () => {
    writeProject(
      root,
      'libs/ops',
      'ops',
      { readWhen: 'reaching nodes', readFirst: 'src/index.ts' },
      'dash',
    );
    writeRepositoryFile(
      root,
      'puni.json',
      formatFixtureRegistry({ app: 'changing the app', dash: 'operating' }),
    );
    expect(runMap('nope')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: the map has no section or partition "nope"; its sections: none; its partitions: app, dash\n',
    });
    expect(runMap('')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: the map has no section or partition ""; its sections: none; its partitions: app, dash\n',
    });
  });

  test('a section directory prints that section; sections and partitions share the argument', () => {
    writeRepositoryFile(
      root,
      'wiki/how-to/deploy.md',
      '---\ntitle: Deploy\nread-when: deploying\n---\n',
    );
    expect(runMap('how-to')).toEqual({
      code: 0,
      stdout:
        '# Wiki map: how-to\n\nA task that spans the repository, as ordered steps.\n\n## Read when\n\n- deploying: [Deploy](wiki/how-to/deploy.md)\n',
      stderr: '',
    });
    expect(runMap('concepts').stderr).toBe(
      'error: the map has no section or partition "concepts"; its sections: how-to; its partitions: app\n',
    );
  });

  test('a map with no partitions names none', () => {
    rmSync(join(root, 'apps'), { recursive: true });
    mkdirSync(join(root, 'apps'));
    writeRepositoryFile(root, 'puni.json', formatFixtureRegistry({}));
    expect(runMap('app')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: the map has no section or partition "app"; its sections: none; its partitions: none\n',
    });
  });

  test('purposes index.purpose refuses are one error line naming each, exit 1', () => {
    writeRepositoryFile(root, 'puni.json', formatRegistry('system-state', fixtureRemotes, 1));
    expect(runMap()).toEqual({
      code: 1,
      stdout: '',
      stderr:
        'error: puni.json: map has no purpose for partition app, which the map shows; fix: add "app": "<the task an agent comes to app for>" to the map of puni.json\n',
    });
    writeRepositoryFile(
      root,
      'puni.json',
      formatFixtureRegistry({ app: 'The app.', gone: 'changing nothing' }),
    );
    expect(runMap('app')).toEqual({
      code: 1,
      stdout: '',
      stderr:
        'error: puni.json: map.app must start with a lower-case letter, must not end with a full stop; fix: make the purpose of app a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words; puni.json: map gives a purpose for partition gone, where no project is placed; fix: remove "gone" from the map of puni.json, or place a project there\n',
    });
  });

  test('defective sources print one error line naming each defect and its remedy, exit 1', () => {
    writeProject(root, 'libs/two', 'two', {});
    writeRepositoryFile(root, 'wiki/deploy.md', '# Deploy\n');
    expect(runMap()).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: libs/two/project.json: project two has no metadata.readWhen; fix: ${readWhenRemedy}; libs/two/project.json: project two metadata.readFirst is missing; fix: ${readFirstRemedy}; wiki/deploy.md: does not begin with front matter; fix: ${readWhenRemedy}\n`,
    });
  });

  test('no puni.json prints one error line and exits 1', () => {
    rmSync(join(root, 'puni.json'));
    const run = runMap();
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/^error: no puni\.json in [^\n]+\n$/u);
  });

  test('a puni.json declaring another repository type is refused with one error line and exit 1', () => {
    writeRepositoryFile(root, 'puni.json', formatRegistry('system-records', fixtureRemotes, 1));
    expect(runMap()).toEqual({
      code: 1,
      stdout: '',
      stderr: `error: wiki map needs the system-state repository; ${join(root, 'puni.json')} declares this-repo-type system-records\n`,
    });
  });

  test.each([
    [
      'no repository',
      () => {
        rmSync(join(root, '.git'), { recursive: true });
        mkdirSync(join(root, '.git'));
      },
    ],
    [
      'a corrupt index',
      () => {
        writeFileSync(join(root, '.git/index'), 'not an index');
      },
    ],
  ])('a git that cannot list the checkout (%s) is one error line, exit 1', (_name, breakGit) => {
    breakGit();
    const run = runMap();
    expect([run.code, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^error: git ls-files exited 128: [^\n]+\n$/u);
  });

  test('a page that cannot be read is one error line naming it, exit 1', () => {
    const page = join(root, 'wiki/gate.md');
    chmodSync(page, 0o000);
    try {
      expect(runMap()).toEqual({
        code: 1,
        stdout: '',
        stderr: `error: cannot read wiki/gate.md: EACCES: permission denied, open '${page}'\n`,
      });
    } finally {
      chmodSync(page, 0o600);
    }
  });
});
