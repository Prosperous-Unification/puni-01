import { command, constant, message, object, or } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { listCommands } from './command-catalog';
import { UsageRefused } from './failures';
import type { CliProgram } from './program';
import { printHelp, readInvocation } from './run-parser';

const program: CliProgram<{ readonly leaf: 'one' } | { readonly leaf: 'two' }> = {
  parser: or(
    command('one', object({ leaf: constant('one') }), { brief: message`The first.` }),
    command('two', object({ leaf: constant('two') }), { brief: message`The second.` }),
  ),
  name: 'demo',
  version: '1.2.3',
};

function collect(run: (stdout: (text: string) => void) => unknown): string {
  let printed = '';
  run((text) => {
    printed += text;
  });
  return printed;
}

describe('readInvocation', () => {
  test('a leaf is a command', () => {
    expect(readInvocation(program, ['two'], () => undefined)).toEqual({
      kind: 'command',
      command: { leaf: 'two' },
    });
  });

  test('the version and help are printed, and no arguments mean help', () => {
    expect(collect((stdout) => readInvocation(program, ['--version'], stdout))).toBe('1.2.3');
    const help = collect((stdout) => readInvocation(program, [], stdout));
    expect(help).toBe(collect((stdout) => readInvocation(program, ['--help'], stdout)));
    expect(help).toContain('Usage: demo');
  });

  test('a refused line is UsageRefused with a one-line reason and prints nothing', () => {
    let printed = '';
    let refusal: unknown;
    try {
      readInvocation(program, ['three'], (text) => {
        printed += text;
      });
    } catch (caught) {
      refusal = caught;
    }
    expect(refusal).toBeInstanceOf(UsageRefused);
    expect(refusal).toMatchObject({
      _tag: 'puni/shared-command/UsageRefused',
      message: 'Unexpected option or subcommand: `three`.',
    });
    expect(printed).toBe('');
  });
});

describe('printHelp', () => {
  test('prints what --help prints for the path', () => {
    expect(
      collect((stdout) => {
        printHelp(program, ['one'], stdout);
      }),
    ).toBe(collect((stdout) => readInvocation(program, ['one', '--help'], stdout)));
  });
});

describe('listCommands', () => {
  test('walks the tree by canonical path, with each brief', () => {
    expect(listCommands(program)).toEqual([
      { path: 'demo one', brief: 'The first.' },
      { path: 'demo two', brief: 'The second.' },
    ]);
  });
});
