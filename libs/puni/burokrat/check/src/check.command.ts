import { choice, constant, message, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import { ProjectUnknown, repositoryTypes } from '@puni/shared-checkout';
import type { CheckRequest, RepositoryCheck } from './contract';
import { ProjectScopeRefused, ScopeOptionsConflict } from './failures';
import { formatFinding } from './finding';

/**
 * `check [--repo TYPE] [--project NAME | --cross-project-links | --staged]`: judges one
 * repository of the project against the rule set of its type, or one part of it.
 */
export const checkParser = object({
  kind: constant('check'),
  repo: optional(
    option('--repo', choice(repositoryTypes, { metavar: 'TYPE' }), {
      description: message`Judge the repository of this type (default: the one holding puni.json).`,
    }),
  ),
  project: optional(
    option('--project', string({ metavar: 'NAME' }), {
      description: message`Judge only what this project owns (system-state only).`,
    }),
  ),
  crossProjectLinks: option('--cross-project-links', {
    description: message`Judge only links and paths that leave their project (system-state only).`,
  }),
  staged: option('--staged', {
    description: message`Judge only the staged files, as the index holds them, for secrets.`,
  }),
});

/**
 * The `check` command. Prints each finding as `<rule-id> <path>: <message>; fix: <remedy>`, then
 * a summary naming the type and scope, and returns 1; with no finding it prints one `ok` line and
 * returns 0. A `project` that names no project, a scoping option when the judged repository is
 * not `system-state`, or two scoping options, prints one `error: ` line to `stderr` and returns
 * 2: the command line is wrong, so nothing was judged.
 */
export function createCheckCommand({
  repositoryCheck,
}: {
  repositoryCheck: RepositoryCheck;
}): Command<CheckRequest> {
  return {
    run(request, io) {
      let verdict;
      try {
        verdict = repositoryCheck.check(request, io.cwd);
      } catch (caught) {
        const refused =
          caught instanceof ProjectUnknown ||
          caught instanceof ProjectScopeRefused ||
          caught instanceof ScopeOptionsConflict;
        if (!refused) throw caught;
        io.stderr(`error: ${caught.message}\n`);
        return 2;
      }
      const lines = verdict.findings.map(formatFinding);
      if (lines.length === 0) {
        io.stdout(`ok: ${verdict.summary}, no findings.\n`);
        return 0;
      }
      const noun = lines.length === 1 ? 'finding' : 'findings';
      io.stdout(
        `${lines.join('\n')}\nfail: ${verdict.summary}, ${String(lines.length)} ${noun}.\n`,
      );
      return 1;
    },
  };
}
