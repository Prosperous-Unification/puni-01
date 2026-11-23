import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { burokratParser, dashParser, navigatorParser } from './root-parser';

describe('burokratParser', () => {
  test('a bare group asks for the group help', () => {
    expect(parse(burokratParser, [])).toEqual({ success: true, value: { kind: 'help', path: [] } });
  });

  test('a bare wiki asks for the wiki help', () => {
    expect(parse(burokratParser, ['wiki'])).toEqual({
      success: true,
      value: { kind: 'help', path: ['wiki'] },
    });
  });

  test.each(['repo', 'adr', 'change', 'assess'])('a bare %s asks for its help', (group) => {
    expect(parse(burokratParser, [group])).toEqual({
      success: true,
      value: { kind: 'help', path: [group] },
    });
  });

  test.each([
    ['wiki index', { kind: 'wiki index', print: false }],
    [
      'check',
      {
        kind: 'check',
        repo: undefined,
        project: undefined,
        crossProjectLinks: false,
        staged: false,
      },
    ],
    [
      'check --project puni-dash',
      {
        kind: 'check',
        repo: undefined,
        project: 'puni-dash',
        crossProjectLinks: false,
        staged: false,
      },
    ],
    [
      'check --repo system-records',
      {
        kind: 'check',
        repo: 'system-records',
        project: undefined,
        crossProjectLinks: false,
        staged: false,
      },
    ],
  ] as const)('%s parses to its leaf', (line, value) => {
    expect(parse(burokratParser, line.split(' '))).toEqual({ success: true, value });
  });

  test.each([
    'stray',
    '--bogus',
    'wiki stray',
    'wiki --bogus',
    'wiki index --check',
    'check --bogus',
    'check stray',
    'check --project',
    'check --repo system-docs',
    'repo init',
    'adr add',
    'change archive',
    'assess outcomes',
  ])('%s is refused', (line) => {
    expect(parse(burokratParser, line.split(' ')).success).toBe(false);
  });
});

describe('navigatorParser', () => {
  test.each([
    ['', { kind: 'help', path: [] }],
    ['plan', { kind: 'help', path: ['plan'] }],
    ['research', { kind: 'help', path: ['research'] }],
    ['progress', { kind: 'help', path: ['progress'] }],
    [
      'plan add --title T --topics a,b --summary S',
      { kind: 'plan add', title: 'T', topics: 'a,b', summary: 'S', bodyFile: undefined },
    ],
    [
      'plan add --summary S --body-file b.md --topics a --title T',
      { kind: 'plan add', title: 'T', topics: 'a', summary: 'S', bodyFile: 'b.md' },
    ],
  ] as const)('%j parses to %j', (line, value) => {
    expect(parse(navigatorParser, line.split(' ').filter(Boolean))).toEqual({
      success: true,
      value,
    });
  });

  test.each([
    'stray',
    'plan stray',
    'research add',
    'progress admit',
    'plan add',
    'plan add --title T --topics a',
    'plan add --title T --topics a --summary S --bogus',
  ])('%s is refused', (line) => {
    expect(parse(navigatorParser, line.split(' ')).success).toBe(false);
  });
});

describe('dashParser', () => {
  test.each([
    ['', { kind: 'help', path: [] }],
    ['ops', { kind: 'help', path: ['ops'] }],
    ...(
      ['run', 'progress', 'resources', 'release', 'admission', 'authority', 'mcp', 'pool'] as const
    ).map((group) => [group, { kind: 'help', path: [group] }] as const),
    ['ops ssh n1', { kind: 'ops ssh', node: 'n1', command: [] }],
    ['ops ssh n1 -- hostname', { kind: 'ops ssh', node: 'n1', command: ['hostname'] }],
    [
      'ops ssh n1 sh -c true -- x',
      { kind: 'ops ssh', node: 'n1', command: ['sh', '-c', 'true', '--', 'x'] },
    ],
    ['ops ssh n1 -- -v --help', { kind: 'ops ssh', node: 'n1', command: ['-v', '--help'] }],
    [
      'ops k3s get pods -n kube-system -o wide',
      { kind: 'ops k3s', args: ['get', 'pods', '-n', 'kube-system', '-o', 'wide'] },
    ],
    ['ops k3s get --help', { kind: 'ops k3s', args: ['get', '--help'] }],
    ['ops k3s -- -n x get', { kind: 'ops k3s', args: ['-n', 'x', 'get'] }],
  ] as const)('%j parses to %j', (line, value) => {
    expect(parse(dashParser, line.split(' ').filter(Boolean))).toEqual({ success: true, value });
  });

  test.each([
    'stray',
    'ops stray',
    'ops ssh',
    'ops ssh -x',
    'ops k3s',
    'ops k3s -n x get',
    'run log',
    'progress record',
    'resources init',
    'release plan',
    'admission submit',
    'authority inspect',
    'mcp token',
    'pool import',
  ])('%s is refused', (line) => {
    expect(parse(dashParser, line.split(' ')).success).toBe(false);
  });
});
