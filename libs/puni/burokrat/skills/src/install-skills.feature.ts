import { explainDefect } from '@puni/shared-checkout';
import type { SkillFiles, SkillsInstaller, SkillsRequirements } from './contract';

/** Installs the bundled skills in the current system-state repository, reporting checkout defects. */
export function createSkillsInstaller({
  checkoutRegistry,
  skillFiles,
}: SkillsRequirements & { readonly skillFiles: SkillFiles }): SkillsInstaller {
  return (cwd, platform) => {
    try {
      const repository = checkoutRegistry.locate(cwd);
      if (repository.type !== 'system-state') {
        return {
          kind: 'refused',
          reason: `skills install needs the system-state repository; ${repository.root}/puni.json declares this-repo-type ${repository.type}`,
        };
      }
      return skillFiles.install(repository.root, platform);
    } catch (caught) {
      const reason = explainDefect(caught);
      if (reason === undefined) throw caught;
      return { kind: 'refused', reason };
    }
  };
}
