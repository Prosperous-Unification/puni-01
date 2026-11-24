import { DiBag } from 'di-bag';
import { createSkillsInstallCommand } from './install-skills.command';
import { createSkillsInstaller } from './install-skills.feature';
import { createSkillFiles } from './skill-files.resource';

/** `puni burokrat skills install` over the host's checkout registry and file system. */
export const burokratSkillsModule = DiBag.createBuilder()
  .withServices({ skillFiles: createSkillFiles })
  .withServices({ skillsInstaller: createSkillsInstaller })
  .withServices({ burokratSkillsInstallCommand: createSkillsInstallCommand })
  .buildModule({
    exportedServiceKeys: ['burokratSkillsInstallCommand'],
    moduleLabel: 'puni-burokrat-skills',
  });
