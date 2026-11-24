import { beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  removeScratchDirectoriesAfterEach,
  runGit,
  writeRepositoryFile,
} from '@puni/shared-testing';
import { makeStateRepository } from './repository.test-host';

const scratch = removeScratchDirectoriesAfterEach();

const entrypoint = new URL('./entrypoint.ts', import.meta.url).pathname;

function runPuni(args: readonly string[], cwd: string) {
  const child = Bun.spawnSync([process.execPath, entrypoint, ...args], {
    cwd,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
  });
  return { code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

/** Runs git in `root` with its commits dated `date`. */
function runGitAt(root: string, args: readonly string[], date: string): void {
  const child = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
}

/** One streamed line of a Claude Code request on `feat-a`, at the shipped card's Opus 5.5. */
function claudeLine(output: number): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 's1',
    timestamp: '2026-11-22T10:00:00.000Z',
    version: '2.1.0',
    requestId: 'r1',
    gitBranch: 'feat-a',
    message: {
      model: 'claude-opus-5-5',
      usage: { input_tokens: 1_000_000, output_tokens: output, cache_read_input_tokens: 0 },
    },
  });
}

describe('burokrat assess outcomes through the entrypoint, over a repository with a merge', () => {
  let state = '';
  let logs = '';

  beforeEach(() => {
    state = makeStateRepository(scratch);
    runGit(state, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGitAt(state, ['add', '-A'], '2026-11-22T08:00:00Z');
    runGitAt(state, ['commit', '-qm', 'state'], '2026-11-22T08:00:00Z');
    runGit(state, ['checkout', '-qb', 'feat-a']);
    writeRepositoryFile(state, 'a.md', 'a');
    runGitAt(state, ['add', '-A'], '2026-11-22T09:00:00Z');
    runGitAt(state, ['commit', '-qm', 'a'], '2026-11-22T09:00:00Z');
    runGit(state, ['checkout', '-q', 'main']);
    runGitAt(
      state,
      ['merge', '-q', '--no-ff', '-m', 'Merge pull request #7 from acme/feat-a', 'feat-a'],
      '2026-11-22T12:00:00Z',
    );
    logs = scratch.createDirectory('puni-assess-logs-');
    writeRepositoryFile(
      logs,
      'claude/-demo/s1.jsonl',
      `${[claudeLine(10_000), claudeLine(100_000), '{"type":"assis'].join('\n')}\n`,
    );
    writeRepositoryFile(logs, 'codex/2026/11/22/rollout.jsonl', '');
  });

  const assess = (cwd: string, ...extra: string[]) =>
    runPuni(
      [
        'burokrat',
        'assess',
        'outcomes',
        '--since',
        '2026-11-22T00:00:00Z',
        '--until',
        '2026-11-23T00:00:00Z',
        '--claude-projects',
        join(logs, 'claude'),
        '--codex-sessions',
        join(logs, 'codex'),
        ...extra,
      ],
      cwd,
    );

  test('prints the summary at the shipped list prices and exits 0', () => {
    expect(assess(state)).toEqual({
      code: 0,
      stderr: '',
      stdout: [
        'acme/demo from 2026-11-22T00:00:00.000Z to 2026-11-23T00:00:00.000Z',
        'accepted outcomes: 1',
        'cost: 6.00 USD API-equivalent at the shipped rate card, 1 usage rows',
        'per outcome: 6.00 USD',
        'attributed: 6.00 USD, coverage 100.0%',
        'remainder: 0.00 USD',
        '  ambiguous-references: 0.00 USD',
        '  no-branch: 0.00 USD',
        '  on-default-branch: 0.00 USD',
        '  branch-not-accepted: 0.00 USD',
        'unpriced: 0 rows',
        'unreadable lines skipped: 1',
        '',
      ].join('\n'),
    });
  });

  test('--json prints the whole breakdown, the merge read from git', () => {
    const run = assess(state, '--json');
    expect([run.code, run.stderr]).toEqual([0, '']);
    const breakdown: unknown = JSON.parse(run.stdout);
    expect(breakdown).toMatchObject({
      acceptedOutcomes: 1,
      pricedMicros: 6_000_000,
      outcomes: [
        {
          mergedAt: '2026-11-22T12:00:00.000Z',
          pullRequest: 7,
          headBranch: 'feat-a',
          micros: 6_000_000,
          rules: { 'pull-request-reference': 0, branch: 1 },
        },
      ],
      unreadableLines: [{ path: join(logs, 'claude/-demo/s1.jsonl'), line: 3 }],
    });
  });

  test('a period that is none exits 2; no repository exits 1, each with one error line', () => {
    const refused = runPuni(
      [
        'b',
        'assess',
        'outcomes',
        '--since',
        '2026-11-22T00:00:00Z',
        '--until',
        '2026-11-21T00:00:00Z',
      ],
      state,
    );
    expect(refused).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: the period is refused: 2026-11-21T00:00:00Z is not after 2026-11-22T00:00:00Z\n',
    });
    const nowhere = assess(logs);
    expect([nowhere.code, nowhere.stdout]).toEqual([1, '']);
    expect(nowhere.stderr).toStartWith(`error: no puni.json in ${logs} or any directory above it`);
  });
});
