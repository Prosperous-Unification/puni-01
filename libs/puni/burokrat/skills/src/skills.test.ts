import { describe, expect, test } from 'bun:test';
import { checkoutModule, formatRegistry } from '@puni/shared-checkout';
import { closeAfterEach, fixtureRemotes, type MemoryTree, memoryHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { SkillsInstallRequest } from './contract';
import { burokratSkillsModule } from './module';

const track = closeAfterEach();
const root = '/work/demo';
const findings = '.agents/skills/puni-findings/SKILL.md';
const assessment = '.agents/skills/puni-assessment/SKILL.md';
const claudeFindings = '.claude/skills/puni-findings/SKILL.md';
const claudeAssessment = '.claude/skills/puni-assessment/SKILL.md';

function open(tree: MemoryTree = {}) {
  const host = memoryHost({
    [`${root}/puni.json`]: formatRegistry('system-state', fixtureRemotes, 1),
    ...tree,
  });
  const container = track(
    DiBag.createBuilder()
      .withInstalledModules([checkoutModule, burokratSkillsModule])
      .withServices(host.services)
      .buildContainer(),
  );
  const command = container.resolve('burokratSkillsInstallCommand');
  return {
    run(platform?: SkillsInstallRequest['platform'], cwd = `${root}/sub`) {
      let stdout = '';
      let stderr = '';
      const code = command.run(
        { kind: 'skills install', platform },
        {
          cwd,
          stdout: (text) => {
            stdout += text;
          },
          stderr: (text) => {
            stderr += text;
          },
        },
      );
      return { code, stdout, stderr };
    },
    get(path: string) {
      return host.nodes.get(`${root}/${path}`);
    },
  };
}

describe('skills install', () => {
  test('installs both skills at the repository root in both discovery directories by default', () => {
    const repo = open();
    const run = repo.run();
    expect(run.code).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toContain(findings);
    expect(run.stdout).toContain(claudeAssessment);
    expect(repo.get(findings)).toMatch(/^---\nname: puni-findings\n/u);
    expect(repo.get(assessment)).toMatch(/^---\nname: puni-assessment\n/u);
    expect(repo.get(claudeFindings)).toBe(repo.get(findings));
    expect(repo.get(claudeAssessment)).toBe(repo.get(assessment));
    expect(repo.get(`sub/${findings}`)).toBeUndefined();
  });

  test.each(['codex', 'gemini', 'copilot', 'cursor'] as const)(
    'installs only in .agents for %s',
    (platform) => {
      const repo = open();
      expect(repo.run(platform).code).toBe(0);
      expect(repo.get(findings)).toBeDefined();
      expect(repo.get(assessment)).toBeDefined();
      expect(repo.get(claudeFindings)).toBeUndefined();
    },
  );

  test('installs only in .claude for Claude Code', () => {
    const repo = open();
    expect(repo.run('claude').code).toBe(0);
    expect(repo.get(claudeFindings)).toBeDefined();
    expect(repo.get(claudeAssessment)).toBeDefined();
    expect(repo.get(findings)).toBeUndefined();
  });

  test('can be rerun and reports that nothing needed to be installed', () => {
    const repo = open();
    expect(repo.run().code).toBe(0);
    const prior = repo.get(findings);
    expect(repo.run()).toEqual({ code: 0, stdout: 'PUNI skills are current.\n', stderr: '' });
    expect(repo.get(findings)).toBe(prior);
  });

  test('reports an edited skill without partially installing elsewhere', () => {
    const repo = open({ [`${root}/${claudeAssessment}`]: 'local edit' });
    const run = repo.run();
    expect(run.code).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(claudeAssessment);
    expect(repo.get(claudeAssessment)).toBe('local edit');
    expect(repo.get(findings)).toBeUndefined();
    expect(repo.get(claudeFindings)).toBeUndefined();
  });

  test.each(['.agents', '.agents/skills/puni-findings', findings])(
    'refuses to install through a symlink at %s',
    (path) => {
      const target = { symlink: '/work/other' };
      const repo = open({ [`${root}/${path}`]: target });
      const run = repo.run();
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(path);
      expect(repo.get(path)).toEqual(target);
      expect(repo.get(claudeFindings)).toBeUndefined();
    },
  );

  test('names a file blocking a destination directory and writes nothing', () => {
    const repo = open({ [`${root}/.claude/skills`]: 'file' });
    const run = repo.run();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('.claude/skills');
    expect(repo.get(findings)).toBeUndefined();
  });

  test('requires a governed system-state repository', () => {
    const records = open({
      [`${root}/puni.json`]: formatRegistry('system-records', fixtureRemotes, 1),
    });
    expect(records.run().stderr).toContain('system-state');
    expect(records.get(findings)).toBeUndefined();
    expect(open().run(undefined, '/outside').stderr).toContain('puni.json');
  });
});
