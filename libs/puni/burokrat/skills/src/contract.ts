import type { RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Command } from '@puni/shared-command';

/** The agent harnesses whose project skill directories this command can select. */
export const skillsPlatforms = ['codex', 'claude', 'gemini', 'copilot', 'cursor'] as const;

/** A request to install PUNI's project skills for one harness, or all when omitted. */
export interface SkillsInstallRequest {
  readonly kind: 'skills install';
  readonly platform?: (typeof skillsPlatforms)[number] | undefined;
}

/** Which skill files were created, or the reason an installation was refused. */
export type SkillsInstallOutcome =
  | { readonly kind: 'installed'; readonly created: readonly string[] }
  | { readonly kind: 'refused'; readonly reason: string };

/** The capability to install the bundled skills into the system-state checkout found from cwd. */
export type SkillsInstaller = (
  cwd: string,
  platform: SkillsInstallRequest['platform'],
) => SkillsInstallOutcome;

/** Access to the bundled skills and their destinations under a checkout root. */
export interface SkillFiles {
  /** Finds all conflicts before creating missing files and preserves existing files. */
  install(root: string, platform: SkillsInstallRequest['platform']): SkillsInstallOutcome;
}

/** What the skills module needs to locate the target checkout. */
export interface SkillsRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
}

/** What the skills module exports. */
export interface SkillsExports {
  readonly burokratSkillsInstallCommand: Command<SkillsInstallRequest>;
}
