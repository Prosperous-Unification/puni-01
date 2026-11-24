import { join, posix } from 'node:path';
import type { FileSystem } from '@puni/shared-ports';
import assessment from './bundled/puni-assessment/SKILL.md' with { type: 'text' };
import findings from './bundled/puni-findings/SKILL.md' with { type: 'text' };
import type { SkillFiles, SkillsInstallOutcome, SkillsInstallRequest } from './contract';

const bundledSkills = [
  { name: 'puni-findings', text: findings },
  { name: 'puni-assessment', text: assessment },
] as const;

function skillDirectories(platform: SkillsInstallRequest['platform']): readonly string[] {
  if (platform === undefined) return ['.agents/skills', '.claude/skills'];
  return platform === 'claude' ? ['.claude/skills'] : ['.agents/skills'];
}

interface SkillFile {
  readonly path: string;
  readonly text: string;
}

function destination(
  fileSystem: FileSystem,
  root: string,
  file: SkillFile,
): 'missing' | 'current' | { readonly conflict: string } {
  let directory = posix.dirname(file.path);
  const parents: string[] = [];
  while (directory !== '.') {
    parents.unshift(directory);
    directory = posix.dirname(directory);
  }
  for (const parent of parents) {
    const kind = fileSystem.stat(join(root, parent), 'no-follow');
    if (kind === 'absent') return 'missing';
    if (kind !== 'directory') return { conflict: `${parent} is a ${kind}, expected a directory` };
  }

  const target = join(root, file.path);
  const kind = fileSystem.stat(target, 'no-follow');
  if (kind === 'absent') return 'missing';
  if (kind !== 'file') return { conflict: `${file.path} is a ${kind}, expected a file` };
  return fileSystem.readText(target) === file.text
    ? 'current'
    : { conflict: `${file.path} differs from the bundled skill; move it aside to install` };
}

/** The bundled files are published only at missing destinations, after checking them all. */
export function createSkillFiles({ fileSystem }: SkillFilesRequirements): SkillFiles {
  return {
    install(root, platform) {
      const missing: SkillFile[] = [];
      for (const directory of skillDirectories(platform)) {
        for (const { name, text } of bundledSkills) {
          const file = { path: `${directory}/${name}/SKILL.md`, text };
          const status = destination(fileSystem, root, file);
          if (typeof status !== 'string') return { kind: 'refused', reason: status.conflict };
          if (status === 'missing') missing.push(file);
        }
      }

      const created: string[] = [];
      for (const file of missing) {
        const outcome = writeMissing(fileSystem, root, file);
        if (outcome === 'written') created.push(file.path);
        else if (outcome !== 'current') return outcome;
      }
      return { kind: 'installed', created };
    },
  };
}

/** What access to bundled skill destinations requires from its host. */
export interface SkillFilesRequirements {
  readonly fileSystem: FileSystem;
}

/** An overlapping install can publish identical contents first, but never replaces any file. */
function writeMissing(
  fileSystem: FileSystem,
  root: string,
  file: SkillFile,
): 'current' | 'written' | Extract<SkillsInstallOutcome, { kind: 'refused' }> {
  const target = join(root, file.path);
  const status = destination(fileSystem, root, file);
  if (status === 'current') return status;
  if (typeof status !== 'string') return { kind: 'refused', reason: status.conflict };

  fileSystem.makeDirectory(join(root, posix.dirname(file.path)));
  try {
    fileSystem.writeNew(target, file.text);
    return 'written';
  } catch (caught) {
    if (!(caught instanceof Error && 'code' in caught && caught.code === 'EEXIST')) throw caught;
    const concurrent = destination(fileSystem, root, file);
    return concurrent === 'current'
      ? 'current'
      : { kind: 'refused', reason: `${file.path} changed during installation` };
  }
}
