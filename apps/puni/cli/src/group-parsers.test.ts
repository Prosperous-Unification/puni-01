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

  test('wiki map takes an empty argument, for the command to refuse by name', () => {
    expect(parse(burokratParser, ['wiki', 'map', ''])).toEqual({
      success: true,
      value: { kind: 'wiki map', partition: '' },
    });
  });

  test.each(['repo', 'adr', 'change', 'assess', 'review', 'skills'])(
    'a bare %s asks for its help',
    (group) => {
      expect(parse(burokratParser, [group])).toEqual({
        success: true,
        value: { kind: 'help', path: [group] },
      });
    },
  );

  test.each([
    ['wiki map', { kind: 'wiki map', partition: undefined }],
    ['wiki map dash/ops', { kind: 'wiki map', partition: 'dash/ops' }],
    ['skills install --platform claude', { kind: 'skills install', platform: 'claude' }],
    [
      'review start --request r.json --state s.json',
      { kind: 'review start', request: 'r.json', state: 's.json' },
    ],
    ['review next --state s.json', { kind: 'review next', state: 's.json' }],
    [
      'review submit --state s.json --result r.json',
      { kind: 'review submit', state: 's.json', responseFile: 'r.json' },
    ],
    [
      'review file --state s.json --title T --topics a --summary S',
      { kind: 'review file', state: 's.json', title: 'T', topics: 'a', summary: 'S' },
    ],
    ['assess templates --json', { kind: 'assess templates', json: true }],

    [
      'check',
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
      'check --project puni-dash',
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
      'check --repo system-records',
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
    [
      'check --commits main..HEAD',
      {
        kind: 'check',
        repo: undefined,
        project: undefined,
        crossProjectLinks: false,
        staged: false,
        commits: 'main..HEAD',
        merged: false,
      },
    ],
    ['repo init --name shop', { kind: 'repo init', name: 'shop', owner: undefined }],
    ['repo init --owner acme --name shop', { kind: 'repo init', name: 'shop', owner: 'acme' }],
    ['repo upgrade', { kind: 'repo upgrade' }],
    [
      'adr add --title T --topics a,b --summary S',
      { kind: 'adr add', title: 'T', topics: 'a,b', summary: 'S', bodyFile: undefined },
    ],
    [
      'adr add --summary S --body-file b.md --topics a --title T',
      { kind: 'adr add', title: 'T', topics: 'a', summary: 'S', bodyFile: 'b.md' },
    ],
    [
      'assess outcomes --since 2026-11-22T00:00:00Z --until 2026-11-24T00:00:00Z --json',
      {
        kind: 'assess outcomes',
        since: '2026-11-22T00:00:00Z',
        until: '2026-11-24T00:00:00Z',
        rateCard: undefined,
        claudeProjects: [],
        codexSessions: [],
        json: true,
      },
    ],
  ] as const)('%s parses to its leaf', (line, value) => {
    expect(parse(burokratParser, line.split(' '))).toEqual({ success: true, value });
  });

  test.each([
    'stray',
    '--bogus',
    'wiki stray',
    'review submit --state s.json',
    'skills install --platform unknown',
    'wiki --bogus',
    'wiki map --check',
    'wiki map dash ops',
    'wiki index',
    'check --bogus',
    'check stray',
    'check --project',
    'check --repo system-docs',
    'repo init',
    'repo init --owner acme',
    'repo init --name',
    'repo init --name x --bogus',
    'repo upgrade --bogus',
    'repo upgrade stray',
    'adr add',
    'adr add --title T --topics a',
    'adr stray',
    'change archive',
    'assess outcomes',
    'assess outcomes --since 2026-11-22T00:00:00Z',
    'assess outcomes --until 2026-11-24T00:00:00Z --since',
    'assess stray',
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
    [
      'research add --title T --topics a --summary S --body-file b.md',
      { kind: 'research add', title: 'T', topics: 'a', summary: 'S', bodyFile: 'b.md' },
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
    'research add --title T --topics a',
    'research stray',
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
    [
      'run log --title T --topics a,b --summary S',
      { kind: 'run log', title: 'T', topics: 'a,b', summary: 'S', bodyFile: undefined },
    ],
    ['resources create --name p', { kind: 'resources create', name: 'p', from: 'HEAD' }],
    ['resources create --from v1 --name p', { kind: 'resources create', name: 'p', from: 'v1' }],
    ['resources list', { kind: 'resources list' }],
    [
      'resources exec p -- git status --short',
      { kind: 'resources exec', name: 'p', command: ['git', 'status', '--short'] },
    ],
    ['resources remove p', { kind: 'resources remove', name: 'p', force: false }],
    ['resources remove p --force', { kind: 'resources remove', name: 'p', force: true }],
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
    'run log --title T --topics a',
    'run start',
    'progress record',
    'resources init',
    'resources create',
    'resources list x',
    'resources remove',
    'resources remove p --hard',
    'release plan',
    'admission submit',
    'authority inspect',
    'mcp token',
    'pool import',
  ])('%s is refused', (line) => {
    expect(parse(dashParser, line.split(' ')).success).toBe(false);
  });
});
