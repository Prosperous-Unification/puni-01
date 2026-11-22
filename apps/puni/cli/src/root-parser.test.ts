import { describe, expect, test } from 'bun:test';
import cliPackage from '../package.json' with { type: 'json' };
import {
  listCommands,
  readInvocation as readProgramInvocation,
  UsageRefused,
} from '@puni/shared-command';
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
      command: { group, request: group === 'burokrat' ? { kind: 'help', path: [] } : {} },
    });
  });

  test.each([
    ['b wiki index', { kind: 'wiki index' }],
    ['bur check', { kind: 'check', repo: undefined, project: undefined }],
    ['b check --project puni-dash', { kind: 'check', repo: undefined, project: 'puni-dash' }],
    [
      'b check --repo system-records',
      { kind: 'check', repo: 'system-records', project: undefined },
    ],
  ] as const)('%s selects %j', (line, request) => {
    expect(readInvocation(line.split(' '), () => undefined)).toEqual({
      kind: 'command',
      command: { group: 'burokrat', request },
    });
  });

  test('b wiki --help prints the wiki help listing index', () => {
    const help = readPrinted(['b', 'wiki', '--help']);
    expect(help).toContain('Generate the wiki index.\nUsage: puni burokrat');
    expect(readListedNames(help)).toEqual(['index']);
  });

  test.each(spellings)('%s --help prints the %s help', (spelling, group) => {
    expect(readPrinted([spelling, '--help'])).toMatch(
      new RegExp(`^Usage: puni ${group}[ \n]`, 'mu'),
    );
  });

  test('b --help shows that a bare burokrat is valid and lists check and wiki', () => {
    const help = readPrinted(['b', '--help']);
    expect(help).toContain(
      'Usage: puni burokrat [(check [--repo TYPE] [--project NAME] | wiki [index])]\n',
    );
    expect(readListedNames(help)).toEqual(['check', 'wiki']);
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
    ['b wiki index --check', 'Unexpected option or subcommand: `--check`.'],
    ['b check --project', '`--project` requires `NAME`.'],
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

describe('listCommands', () => {
  test('walks the parser tree: every group and leaf by canonical path, with its brief', () => {
    expect(listCommands(puniProgram)).toEqual([
      { path: 'puni navigator', brief: 'Plan: decide what to do.' },
      { path: 'puni dash', brief: 'Execute and operate: do it.' },
      { path: 'puni burokrat', brief: 'Judge: decide whether it was done right.' },
      { path: 'puni burokrat check', brief: 'Judge the repository against its rules.' },
      { path: 'puni burokrat wiki', brief: 'Generate the wiki index.' },
      { path: 'puni burokrat wiki index', brief: 'Write the generated wiki index.' },
    ]);
  });
});
