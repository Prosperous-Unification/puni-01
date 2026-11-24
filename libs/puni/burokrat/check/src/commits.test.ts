import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { removeFixture, writeRepositoryFile } from '@puni/shared-testing';
import { type CheckHost, openCheckHost } from './check.test-host';
import { makeRepository } from './repository-pair.test-host';
import { credentialLookalikes, credentialSamples, forbiddenAddress } from './secrets.test-host';

let root = '';
let host: CheckHost;

beforeAll(() => {
  host = openCheckHost();
});

afterAll(async () => {
  await host.close();
});

beforeEach(async () => {
  root = await makeRepository();
  commit('base');
});

afterEach(() => {
  // An empty root is a setup that failed before the fixture existed: nothing to remove.
  if (root !== '') removeFixture(root);
  root = '';
});

/** Runs git in the fixture as a fixed author, returning what it printed, trimmed. */
function git(...args: string[]): string {
  const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
  return child.stdout.toString().trim();
}

/** Commits everything in the fixture with `message`, returning the commit's abbreviated hash. */
function commit(message: string): string {
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', message);
  return git('rev-parse', '--short', 'HEAD');
}

const githubToken = credentialSamples[2]?.[1] ?? '';

const credentialRemedy =
  'remove the credential from the file, rotate it, and read it from the environment or a secret store';
const addressRemedy =
  "move the address to the operator's SSH configuration or the records repository and name the host by its SSH alias; a test uses 192.0.2.0/24";

/** The remedy a finding in `commit` of a range from `base` ends with. */
function inCommit(remedy: string, hash: string, base = 'base'): string {
  return `${remedy}; ${hash} is pushed, so it is public: rotate any credential it exposed, and before merge rewrite the branch so that no commit holds it (\`git rebase -i ${base}\`, edit ${hash}, \`git push --force-with-lease\`)`;
}

/** Adds `line` to `path` in one commit, then removes the file in a second. */
function addThenRemove(path: string, line: string): string {
  writeRepositoryFile(root, path, `export {};\n${line}\n`);
  const added = commit('add a file');
  rmSync(join(root, path));
  commit('remove it');
  return added;
}

describe('check --commits', () => {
  beforeEach(() => {
    git('tag', 'base');
  });

  test('a credential one commit adds and the next removes: the tree passes, the range names the commit', () => {
    const added = addThenRemove('apps/one/src/env.ts', githubToken);
    expect(host.runCheck({}, root).code).toBe(0);
    expect(host.runCheck({ commits: 'base..HEAD' }, root)).toEqual({
      code: 1,
      stdout: `secrets.plaintext ${added}:apps/one/src/env.ts: line 2 holds what looks like a GitHub token; fix: ${inCommit(credentialRemedy, added)}\nfail: system-state, commits base..HEAD, 2 commits, 2 rules, 1 finding.\n`,
      stderr: '',
    });
  });

  test('an address one commit adds and the next removes: the range names the commit', () => {
    const added = addThenRemove('apps/one/hosts.txt', `host ${forbiddenAddress}`);
    expect(host.runCheck({}, root).code).toBe(0);
    expect(host.runCheck({ commits: 'base..HEAD' }, root).stdout).toBe(
      `secrets.addresses ${added}:apps/one/hosts.txt: line 2 holds an IPv4 address; fix: ${inCommit(addressRemedy, added)}\nfail: system-state, commits base..HEAD, 2 commits, 2 rules, 1 finding.\n`,
    );
  });

  test('a credential in a commit message is a finding in that commit', () => {
    const hash = commit(`deploy\n\nused ${githubToken} for it`);
    expect(host.runCheck({}, root).code).toBe(0);
    expect(host.runCheck({ commits: 'base..HEAD' }, root).stdout).toBe(
      `secrets.plaintext ${hash}:(commit message): line 3 holds what looks like a GitHub token; fix: ${inCommit(credentialRemedy, hash)}\nfail: system-state, commits base..HEAD, 1 commit, 2 rules, 1 finding.\n`,
    );
  });

  test('only added lines are judged, at their line numbers in the commit', () => {
    writeRepositoryFile(root, 'apps/one/notes.txt', 'one\ntwo\n');
    commit('notes');
    git('tag', 'later');
    writeRepositoryFile(root, 'apps/one/notes.txt', `one\n${githubToken}\ntwo\n`);
    const added = commit('insert');
    expect(host.runCheck({ commits: 'later..HEAD' }, root).stdout).toStartWith(
      `secrets.plaintext ${added}:apps/one/notes.txt: line 2 holds what looks like a GitHub token;`,
    );
  });

  test('near misses pass: a documentation address, short and placeholder token-like values', () => {
    writeRepositoryFile(
      root,
      'apps/one/near.ts',
      `${['host 192.0.2.7', 'peer 127.0.0.1', ...credentialLookalikes].join('\n')}\n`,
    );
    commit(`near misses\n\n${credentialLookalikes.join('\n')}`);
    expect(host.runCheck({ commits: 'base..HEAD' }, root)).toEqual({
      code: 0,
      stdout: 'ok: system-state, commits base..HEAD, 1 commit, 2 rules, no findings.\n',
      stderr: '',
    });
  });

  test('an empty range passes', () => {
    expect(host.runCheck({ commits: 'HEAD..HEAD' }, root).stdout).toBe(
      'ok: system-state, commits HEAD..HEAD, 0 commits, 2 rules, no findings.\n',
    );
  });

  test.each(['HEAD', 'base...HEAD', '..HEAD', 'base..', 'a..b..c'])(
    '%s is no range: refused with exit 2',
    (range) => {
      expect(host.runCheck({ commits: range }, root)).toEqual({
        code: 2,
        stdout: '',
        stderr: `error: --commits ${JSON.stringify(range)} is not a range <base>..<head> of two revisions\n`,
      });
    },
  );

  test('an end naming no commit is refused with exit 2, naming it', () => {
    expect(host.runCheck({ commits: 'base..no-such-branch' }, root)).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: no-such-branch names no commit of the repository; fetch it, or name a commit that exists\n',
    });
  });

  test('--commits with another scoping option is refused', () => {
    expect(host.runCheck({ commits: 'base..HEAD', staged: true }, root)).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: --staged and --commits each choose what to judge; give at most one\n',
    });
  });

  test('a git that cannot list the commits is the one repository.git finding, not a pass', () => {
    rmSync(join(root, '.git'), { recursive: true });
    const run = host.runCheck({ commits: 'base..HEAD' }, root);
    expect(run.code).toBe(1);
    expect(run.stdout).toStartWith('repository.git .: ');
  });
});
