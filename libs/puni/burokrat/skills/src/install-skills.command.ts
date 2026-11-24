import { choice, constant, message, object, option, optional } from '@optique/core';
import type { Command } from '@puni/shared-command';
import { type SkillsInstaller, type SkillsInstallRequest, skillsPlatforms } from './contract';

/** Parses an installation for all harnesses or one selected with `--platform`. */
export const skillsInstallParser = object({
  kind: constant('skills install'),
  platform: optional(
    option('--platform', choice(skillsPlatforms, { metavar: 'PLATFORM' }), {
      description: message`Install for one harness: codex, claude, gemini, copilot or cursor.`,
    }),
  ),
});

/** Reports new paths or that the skills are current, and returns 1 for a refused installation. */
export function createSkillsInstallCommand({
  skillsInstaller,
}: {
  skillsInstaller: SkillsInstaller;
}): Command<SkillsInstallRequest> {
  return {
    run(request, io) {
      const outcome = skillsInstaller(io.cwd, request.platform);
      if (outcome.kind === 'refused') {
        io.stderr(`error: ${outcome.reason}\n`);
        return 1;
      }
      io.stdout(
        outcome.created.length === 0
          ? 'PUNI skills are current.\n'
          : `${outcome.created.map((path) => `installed: ${path}`).join('\n')}\n`,
      );
      return 0;
    },
  };
}
