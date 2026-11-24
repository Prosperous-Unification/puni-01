import { choice, constant, message, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import {
  FileUnreadable,
  ProjectUnknown,
  RevisionUnknown,
  repositoryTypes,
} from '@puni/shared-checkout';
import type { CheckRequest, RepositoryCheck } from './contract';
import { CommitRangeRefused, ProjectScopeRefused, ScopeOptionsConflict } from './failures';
import { formatFinding } from './finding';

/**
 * `check [--repo TYPE] [--project NAME | --cross-project-links | --staged | --commits
 * BASE..HEAD]`: judges one repository of the project against the rule set of its type, or one
 * part of it.
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
  commits: optional(
    option('--commits', string({ metavar: 'BASE..HEAD' }), {
      description: message`Judge what each commit of the range adds, and its message, for secrets.`,
    }),
  ),
});

/**
 * The `check` command. Prints each finding as `<rule-id> <path>: <message>; fix: <remedy>`, a
 * finding of `--commits` as `<rule-id> <commit>:<path>: …`, then a summary naming the type and
 * scope, and returns 1; with no finding it prints one `ok` line and returns 0. A `project` that
 * names no project, a scoping option when the judged repository is not `system-state`, two
 * scoping options, or a `--commits` that is no range or names no commit, prints one `error: `
 * line to `stderr` and returns 2: the command line is wrong, so nothing was judged. A file the check needs that cannot be
 * read prints one `error: ` line naming it and returns 1: nothing can be judged until it can.
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
        if (caught instanceof FileUnreadable) {
          io.stderr(`error: ${caught.message}\n`);
          return 1;
        }
        const refused =
          caught instanceof ProjectUnknown ||
          caught instanceof ProjectScopeRefused ||
          caught instanceof ScopeOptionsConflict ||
          caught instanceof CommitRangeRefused ||
          caught instanceof RevisionUnknown;
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
