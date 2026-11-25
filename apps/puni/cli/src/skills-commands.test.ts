import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { listCommands } from '@puni/shared-command';
import { type InProcessPuni, openInProcessPuni } from './in-process.test-host';
import { puniProgram } from './root-parser';
import { makeStateRepository } from './repository.test-host';

const scratchDirectories = removeScratchDirectoriesAfterEach();

let puni: InProcessPuni;
let root: string;

beforeAll(() => {
  puni = openInProcessPuni();
});

afterAll(async () => {
  await puni.close();
});

beforeEach(() => {
  root = makeStateRepository(scratchDirectories);
});

test('installs the bundled skills for both project discovery directories', () => {
  const installed = puni.run(['burokrat', 'skills', 'install'], root);
  expect([installed.code, installed.stderr]).toEqual([0, '']);
  for (const skill of ['puni-findings', 'puni-assessment', 'puni-plan']) {
    const portablePath = `.agents/skills/${skill}/SKILL.md`;
    const claudePath = `.claude/skills/${skill}/SKILL.md`;
    const text = readFileSync(join(root, portablePath), 'utf8');
    expect(text).toStartWith(`---\nname: ${skill}\n`);
    expect(readFileSync(join(root, claudePath), 'utf8')).toBe(text);
    expect(installed.stdout).toContain(portablePath);
    expect(installed.stdout).toContain(claudePath);
  }
  expect(puni.run(['burokrat', 'skills', 'install'], root)).toEqual({
    code: 0,
    stdout: 'PUNI skills are current.\n',
    stderr: '',
  });
});

test('selects a harness and refuses to replace an edited skill', () => {
  const onlyClaude = puni.run(['burokrat', 'skills', 'install', '--platform', 'claude'], root);
  expect([onlyClaude.code, onlyClaude.stderr]).toEqual([0, '']);

  const path = '.claude/skills/puni-findings/SKILL.md';
  writeFileSync(join(root, path), 'authored locally\n');
  const conflicted = puni.run(['burokrat', 'skills', 'install'], root);
  expect(conflicted.code).toBe(1);
  expect(conflicted.stderr).toContain(path);
  expect(readFileSync(join(root, path), 'utf8')).toBe('authored locally\n');
  expect(existsSync(join(root, '.agents'))).toBe(false);
});

test('every puni command an installed skill names is a leaf of the command tree, or below one', () => {
  expect(puni.run(['burokrat', 'skills', 'install', '--platform', 'claude'], root).code).toBe(0);
  const paths = listCommands(puniProgram).map(({ path }) => path);
  const leaves = paths.filter((path) => !paths.some((other) => other.startsWith(`${path} `)));
  const named: string[] = [];
  for (const skill of readdirSync(join(root, '.claude/skills'))) {
    const text = readFileSync(join(root, '.claude/skills', skill, 'SKILL.md'), 'utf8');
    for (const [, words] of text.matchAll(/(?:`|^)(puni(?: [a-z][a-z-]*)+)/gmu)) {
      if (words !== undefined) named.push(words);
    }
  }
  expect(named).toContain('puni navigator plan add');
  expect(
    named.filter((words) => !leaves.some((leaf) => `${words} `.startsWith(`${leaf} `))),
  ).toEqual([]);
});
