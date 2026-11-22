import { describe, expect, test } from 'bun:test';
import cliPackage from '../package.json' with { type: 'json' };
import { type Group, readInvocation, UsageRefusal } from './cli-parser';

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
    expect(refusal).toBeInstanceOf(UsageRefusal);
    if (!(refusal instanceof UsageRefusal)) throw refusal;
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
    expect(readInvocation([spelling], () => undefined)).toEqual({
      kind: 'command',
      command: { group, request: {} },
    });
  });

  test.each(spellings)('%s --help prints the %s help', (spelling, group) => {
    expect(readPrinted([spelling, '--help'])).toContain(`Usage: puni ${group}\n`);
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
