import { describe, expect, test } from 'bun:test';
import cliPackage from '../package.json' with { type: 'json' };
import {
  listCommands,
  readInvocation as readProgramInvocation,
  UsageRefused,
} from '@puni/shared-command';
import { rulesUpgradeCommand } from '@puni/shared-checkout';
import { type Group, puniProgram } from './root-parser';

function readInvocation(args: readonly string[], stdout: (text: string) => void) {
  return readProgramInvocation(puniProgram, args, stdout);
}

function readPrinted(args: readonly string[]): string {
  let printed = '';
  const invocation = readInvocation(args, (text) => {
    printed += text;
  });
  expect(invocation).toEqual({ kind: 'printed' });
  return printed;
}

function readRefusal(args: readonly string[]): { message: string; printed: string } {
  let printed = '';
  try {
    readInvocation(args, (text) => {
      printed += text;
    });
  } catch (refusal) {
    expect(refusal).toBeInstanceOf(UsageRefused);
    if (!(refusal instanceof UsageRefused)) throw refusal;
    return { message: refusal.message, printed };
  }
  throw new Error(`${args.join(' ')} was not refused`);
}

/** The names in the command list of a help page: two-space indent, then the term. */
function readListedNames(help: string): string[] {
  return [...help.matchAll(/^ {2}(\S+)/gmu)].map((match) => match[1] ?? '');
}

const spellings: readonly (readonly [string, Group])[] = [
  ['navigator', 'navigator'],
  ['nav', 'navigator'],
  ['n', 'navigator'],
  ['dash', 'dash'],
  ['d', 'dash'],
  ['burokrat', 'burokrat'],
  ['bur', 'burokrat'],
  ['b', 'burokrat'],
];

describe('readInvocation', () => {
  test.each(spellings)('%s selects %s', (spelling, group) => {
    const invocation: unknown = readInvocation([spelling], () => undefined);
    expect(invocation).toEqual({
      kind: 'command',
      command: { group, request: { kind: 'help', path: [] } },
    });
  });

  test.each([
    ['b wiki map', { kind: 'wiki map', partition: undefined }],
    ['b wiki map dash', { kind: 'wiki map', partition: 'dash' }],
    [
      'bur check',
      {
        kind: 'check',
        repo: undefined,
        project: undefined,
        crossProjectLinks: false,
        staged: false,
        commits: undefined,
        merged: false,
      },
    ],
    [
      'b check --project puni-dash',
      {
        kind: 'check',
        repo: undefined,
        project: 'puni-dash',
        crossProjectLinks: false,
        staged: false,
        commits: undefined,
        merged: false,
      },
    ],
    [
      'b check --repo system-records',
      {
        kind: 'check',
        repo: 'system-records',
        project: undefined,
        crossProjectLinks: false,
        staged: false,
        commits: undefined,
        merged: false,
      },
    ],
  ] as const)('%s selects %j', (line, request) => {
    expect(readInvocation(line.split(' '), () => undefined)).toEqual({
      kind: 'command',
      command: { group: 'burokrat', request },
    });
  });

  test.each([
    ['d ops ssh n1 -- hostname', 'dash', { kind: 'ops ssh', node: 'n1', command: ['hostname'] }],
    ['d ops k3s get nodes', 'dash', { kind: 'ops k3s', args: ['get', 'nodes'] }],
    [
      'n plan add --title T --topics a --summary S',
      'navigator',
      {
        kind: 'plan add',
        title: 'T',
        topics: 'a',
        summary: 'S',
        bodyFile: undefined,
        supersedes: undefined,
      },
    ],
  ] as const)('%s selects %s %j', (line, group, request) => {
    const invocation: unknown = readInvocation(line.split(' '), () => undefined);
    expect(invocation).toEqual({
      kind: 'command',
      command: { group, request },
    });
  });

  test.each([
    ['d ops', ['ssh', 'k3s']],
    ['n plan', ['add']],
    ['n research', ['add']],
    ['b repo', ['init', 'upgrade']],
    ['b adr', ['add']],
    ['b assess', ['outcomes', 'templates']],
    ['b review', ['start', 'next', 'submit', 'file']],
    ['b skills', ['install']],
    [
      'd',
      ['ops', 'run', 'progress', 'resources', 'release', 'admission', 'authority', 'mcp', 'pool'],
    ],
    ['n', ['plan', 'research', 'progress']],
  ])('%s --help lists %j', (line, names) => {
    expect(readListedNames(readPrinted([...line.split(' '), '--help']))).toEqual(names);
  });

  test('b wiki --help prints the wiki help listing map', () => {
    const help = readPrinted(['b', 'wiki', '--help']);
    expect(help).toContain('Print the wiki map.\nUsage: puni burokrat');
    expect(readListedNames(help)).toEqual(['map']);
  });

  test.each(spellings)('%s --help prints the %s help', (spelling, group) => {
    expect(readPrinted([spelling, '--help'])).toMatch(
      new RegExp(`^Usage: puni ${group}[ \n]`, 'mu'),
    );
  });

  test('b --help shows that a bare burokrat is valid and lists every burokrat group', () => {
    const help = readPrinted(['b', '--help']);
    expect(help).toMatch(/^Usage: puni burokrat \[\(check /mu);
    expect(help).toContain('--commits BASE..HEAD');
    expect(help).toContain('wiki [map [PARTITION]]');
    expect(help).toContain('| upgrade)]');
    expect(readListedNames(help)).toEqual([
      'check',
      'wiki',
      'repo',
      'adr',
      'change',
      'skills',
      'review',
      'assess',
    ]);
  });

  test.each(['--help', 'help', ''])(
    'root help `puni %s` lists exactly the three groups',
    (line) => {
      const groups = readListedNames(readPrinted(line.split(' ').filter(Boolean))).filter(
        (name) => !['help', 'completion', '--help', '--version'].includes(name),
      );
      expect(groups).toEqual(['navigator', 'dash', 'burokrat']);
    },
  );

  test('root help gives each group a brief', () => {
    const help = readPrinted(['--help']);
    expect(help).toMatch(/^ {2}navigator +Plan: decide what to do\.$/mu);
    expect(help).toMatch(/^ {2}dash +Execute and operate: do it\.$/mu);
    expect(help).toMatch(/^ {2}burokrat +Judge: decide whether it was done right\.$/mu);
  });

  test('--version prints the package version', () => {
    expect(readPrinted(['--version']).trim()).toBe(cliPackage.version);
  });

  test.each(['bash', 'zsh', 'fish'])('completion %s prints a script', (shell) => {
    expect(readPrinted(['completion', shell])).toContain('puni');
  });

  test.each([
    ['nope', 'Unexpected option or subcommand: `nope`.'],
    ['nav stray', 'Unexpected option or subcommand: `stray`.'],
    ['--bogus', 'Unexpected option or subcommand: `--bogus`.'],
    ['d --bogus', 'Unexpected option or subcommand: `--bogus`.'],
    ['b wiki nope', 'Unexpected option or subcommand: `nope`.'],
    ['d release plan', 'Unexpected option or subcommand: `plan`.'],
    ['n research stray', 'Unexpected option or subcommand: `stray`.'],
    ['b adr --bogus', 'Unexpected option or subcommand: `--bogus`.'],
    ['b wiki map --check', 'Unexpected option or subcommand: `--check`.'],
    ['b check --project', '`--project` requires `NAME`.'],
    ['d ops k3s', 'Expected a `KUBECTL_ARG`, but too few arguments.'],
    ['d ops ssh', 'Expected a `NODE`, but too few arguments.'],
    [
      'completion',
      'Missing shell name for completion. Generate shell completion script or provide completions.',
    ],
  ])('%s refuses in one line and prints nothing', (line, reason) => {
    expect(readRefusal(line.split(' '))).toEqual({ message: reason, printed: '' });
  });

  test('a wrapped refusal is joined into one line', () => {
    const token = `x${'y'.repeat(120)}`;
    expect(readRefusal([token]).message).toBe(`Unexpected option or subcommand: \`${token}\`.`);
  });
});

describe('the rules upgrade command', () => {
  test('the command check and the agents.rules remedy name is in the command tree', () => {
    expect(listCommands(puniProgram).map(({ path }) => path)).toContain(rulesUpgradeCommand);
  });
});

describe('listCommands', () => {
  test('walks the parser tree: every group and leaf by canonical path, with its brief', () => {
    expect(listCommands(puniProgram)).toEqual([
      { path: 'puni navigator', brief: 'Plan: decide what to do.' },
      { path: 'puni navigator plan', brief: 'File plans in the records repository.' },
      { path: 'puni navigator plan add', brief: 'File a plan in the records repository.' },
      { path: 'puni navigator research', brief: 'File research in the records repository.' },
      { path: 'puni navigator research add', brief: 'File research in the records repository.' },
      {
        path: 'puni navigator progress',
        brief: 'Admit progress receipts and turn them into WBS commands.',
      },
      { path: 'puni dash', brief: 'Execute and operate: do it.' },
      { path: 'puni dash ops', brief: 'Reach the nodes of the inventory.' },
      {
        path: 'puni dash ops ssh',
        brief: 'Open a shell on a node, or run a command there.',
      },
      {
        path: 'puni dash ops k3s',
        brief: 'Run kubectl on the node that runs the k3s server.',
      },
      { path: 'puni dash run', brief: 'Record runs and their outcomes.' },
      {
        path: 'puni dash run log',
        brief: "Record a run's outcome as an assessment in the records repository.",
      },
      { path: 'puni dash progress', brief: 'Record operator progress as receipts.' },
      {
        path: 'puni dash resources',
        brief: 'Manage disposable worktrees and the commands run in them.',
      },
      {
        path: 'puni dash resources create',
        brief: 'Create a disposable worktree of the system-state repository.',
      },
      {
        path: 'puni dash resources list',
        brief: 'List the disposable worktrees and whether each is clean.',
      },
      { path: 'puni dash resources exec', brief: 'Run a command in a disposable worktree.' },
      {
        path: 'puni dash resources remove',
        brief: 'Remove a disposable worktree and its branch.',
      },
      { path: 'puni dash release', brief: 'Plan and run releases of a product.' },
      {
        path: 'puni dash admission',
        brief: 'Submit candidates for admission and run their checks.',
      },
      {
        path: 'puni dash authority',
        brief: 'Create, inspect and repair the authority of a repository.',
      },
      { path: 'puni dash mcp', brief: 'Issue credentials for the WBS MCP server.' },
      { path: 'puni dash pool', brief: 'Store the keys of agent pools.' },
      { path: 'puni burokrat', brief: 'Judge: decide whether it was done right.' },
      { path: 'puni burokrat check', brief: 'Judge the repository against its rules.' },
      { path: 'puni burokrat wiki', brief: 'Print the wiki map.' },
      {
        path: 'puni burokrat wiki map',
        brief: 'Print the map from a task to the file to read first.',
      },
      {
        path: 'puni burokrat repo',
        brief: 'Set up the repositories puni governs, and raise their rules pin.',
      },
      {
        path: 'puni burokrat repo init',
        brief: 'Create a governed repository here and its records repository beside it.',
      },
      {
        path: 'puni burokrat repo upgrade',
        brief: "Raise this repository's rules pin to the latest epoch, if it passes them.",
      },
      { path: 'puni burokrat adr', brief: 'File architecture decision records.' },
      {
        path: 'puni burokrat adr add',
        brief: 'File an architecture decision record in the records repository.',
      },
      { path: 'puni burokrat change', brief: 'Archive finished changes.' },
      { path: 'puni burokrat skills', brief: "Manage PUNI's repository skills." },
      {
        path: 'puni burokrat skills install',
        brief: 'Install the PUNI review skills in this checkout.',
      },
      {
        path: 'puni burokrat review',
        brief: 'Review evidence against criteria and file the scored findings.',
      },
      { path: 'puni burokrat review start', brief: 'Start a findings or assessment review.' },
      { path: 'puni burokrat review next', brief: 'Read the current review task.' },
      {
        path: 'puni burokrat review submit',
        brief: 'Submit the result of the current review task.',
      },
      {
        path: 'puni burokrat review file',
        brief: 'File and print the completed review by impact.',
      },
      {
        path: 'puni burokrat assess',
        brief: 'List assessment criteria maps and assess the cost of outcomes.',
      },
      {
        path: 'puni burokrat assess outcomes',
        brief: 'Say what the agent work of a period cost per accepted outcome.',
      },
      { path: 'puni burokrat assess templates', brief: 'List versioned assessment criteria maps.' },
    ]);
  });
});
