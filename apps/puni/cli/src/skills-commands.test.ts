import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocType } from '@puni/shared-checkout';
import { removeScratchDirectoriesAfterEach } from '@puni/shared-testing';
import { type InProcessPuni, openInProcessPuni } from './in-process.test-host';
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

test('installs the bundled review skills for both project discovery directories', () => {
  const installed = puni.run(['burokrat', 'skills', 'install'], root);
  expect([installed.code, installed.stderr]).toEqual([0, '']);
  for (const skill of ['puni-findings', 'puni-assessment']) {
    const portablePath = `.agents/skills/${skill}/SKILL.md`;
    const claudePath = `.claude/skills/${skill}/SKILL.md`;
    const text = readFileSync(join(root, portablePath), 'utf8');
    expect(text).toStartWith(`---\nname: ${skill}\n`);
    expect(readDocType(text)).toEqual({ kind: 'declared', type: 'product' });
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
