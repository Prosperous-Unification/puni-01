import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findRepository, RepositoryDefect } from './repository';
import {
  fixtureCounterparts,
  formatFixtureConfig,
  writeRepositoryFile,
} from './repository-fixture';

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'puni-repository-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function refusal(cwd: string): RepositoryDefect {
  try {
    findRepository(cwd);
  } catch (cause) {
    if (cause instanceof RepositoryDefect) return cause;
    throw cause;
  }
  throw new Error(`${cwd} was not refused`);
}

describe('findRepository', () => {
  test.each(['code', 'records'] as const)(
    'walks up to the nearest puni.json declaring %s',
    (kind) => {
      writeRepositoryFile(root, 'puni.json', formatFixtureConfig(kind));
      mkdirSync(join(root, 'a/b'), { recursive: true });
      expect(findRepository(join(root, 'a/b'))).toEqual({
        root: resolve(root),
        kind,
        counterpart: fixtureCounterparts[kind],
      });
    },
  );

  test('the nearest puni.json wins over one further up', () => {
    writeRepositoryFile(root, 'puni.json', formatFixtureConfig('code'));
    writeRepositoryFile(root, 'inner/puni.json', formatFixtureConfig('records'));
    expect(findRepository(join(root, 'inner'))).toEqual({
      root: resolve(root, 'inner'),
      kind: 'records',
      counterpart: fixtureCounterparts.records,
    });
  });

  test('no puni.json up to the filesystem root is a repository.root defect', () => {
    const defect = refusal(root);
    expect(defect.rule).toBe('repository.root');
    expect(defect.message).toBe(`no puni.json in ${root} or any directory above it`);
  });

  test.each([
    [
      '{"puni-repo-kind": "library"}',
      'has puni-repo-kind "library"; expected one of code, records',
    ],
    ['{}', 'has puni-repo-kind missing; expected one of code, records'],
    [
      '{"puni-repo-kind": "code", "name": "x"}',
      'has unknown keys name; it holds only puni-repo-kind and puni-repo-counterpart',
    ],
    ['["code"]', 'is not a JSON object'],
    ['{kind: code}', 'is not valid JSON: '],
  ])('puni.json %s is a repository.kind defect naming the file', (text, problem) => {
    writeRepositoryFile(root, 'puni.json', text);
    const defect = refusal(root);
    expect(defect.rule).toBe('repository.kind');
    expect(defect.path).toBe('puni.json');
    expect(defect.message).toStartWith(`${join(root, 'puni.json')} ${problem}`);
  });

  test.each([
    ['{"puni-repo-kind": "code"}', 'missing'],
    ['{"puni-repo-kind": "code", "puni-repo-counterpart": "demo-records"}', '"demo-records"'],
    [
      '{"puni-repo-kind": "code", "puni-repo-counterpart": "acme/demo/records"}',
      '"acme/demo/records"',
    ],
    ['{"puni-repo-kind": "records", "puni-repo-counterpart": 7}', '7'],
  ])('puni.json %s is a repository.counterpart defect naming the file', (text, value) => {
    writeRepositoryFile(root, 'puni.json', text);
    const defect = refusal(root);
    expect(defect.rule).toBe('repository.counterpart');
    expect(defect.path).toBe('puni.json');
    expect(defect.message).toBe(
      `${join(root, 'puni.json')} has puni-repo-counterpart ${value}; expected the paired repository as owner/name`,
    );
  });
});
