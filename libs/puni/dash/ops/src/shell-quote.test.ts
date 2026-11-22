import { describe, expect, test } from 'bun:test';
import { quoteForPosixShell } from './nodes';
import { buildSshArguments } from './remote-shell.resource';

const awkward = [
  'plain',
  'two words',
  "it's",
  "''",
  '"double"',
  '$HOME and $(id) and `id`',
  'a; rm -rf /',
  'line one\nline two',
  'back\\slash',
  '',
  '-n',
  '*',
];

describe('quoteForPosixShell', () => {
  test.each([
    ['plain', "'plain'"],
    ["it's", "'it'\\''s'"],
    ['', "''"],
  ])('%j is %s', (text, quoted) => {
    expect(quoteForPosixShell(text)).toBe(quoted);
  });

  test('a POSIX shell reading the quoted words joined by spaces gets every argument back', () => {
    const script = `printf '%s\\0' ${awkward.map(quoteForPosixShell).join(' ')}`;
    const child = Bun.spawnSync(['sh', '-c', script]);
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString().split('\0').slice(0, -1)).toEqual(awkward);
  });
});

describe('buildSshArguments', () => {
  test('a shell is ssh to the destination; a command follows --, each word quoted', () => {
    expect(buildSshArguments('n1', [])).toEqual(['ssh', 'n1']);
    expect(buildSshArguments('n1', ['-v', "it's"])).toEqual([
      'ssh',
      'n1',
      '--',
      "'-v'",
      "'it'\\''s'",
    ]);
  });
});
