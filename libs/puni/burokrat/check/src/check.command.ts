import { choice, constant, message, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import {
  FileUnreadable,
  ProjectUnknown,
  repositoryTypes,
  RulesPinAhead,
} from '@puni/shared-checkout';
import type { CheckRequest, NewerRules, RepositoryCheck } from './contract';
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

/** The line naming the rules a repository's pin leaves unapplied, and how to apply them. */
function formatNewer({ pin, ids }: NewerRules): string {
  return `newer: puni.json pins rules epoch ${String(pin)}, so ${ids.join(', ')} ${ids.length === 1 ? 'is' : 'are'} not applied; run puni burokrat repo upgrade\n`;
}

/**
 * The `check` command. Prints each finding as `<rule-id> <path>: <message>; fix: <remedy>`, then
 * a summary naming the type and scope, and returns 1; with no finding it prints one `ok` line and
 * returns 0. When the run holds rules later than the repository's pin, one `newer: ` line after
 * the summary names them and `puni burokrat repo upgrade`. A `project` that names no project, a
 * scoping option when the judged repository is not `system-state`, two scoping options, or a pin
 * later than every rule this puni knows prints one `error: ` line to `stderr` and returns 2:
 * nothing was judged. A file the check needs that cannot be
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
          caught instanceof RulesPinAhead ||
          caught instanceof ProjectUnknown ||
          caught instanceof ProjectScopeRefused ||
          caught instanceof ScopeOptionsConflict;
        if (!refused) throw caught;
        io.stderr(`error: ${caught.message}\n`);
        return 2;
      }
      const lines = verdict.findings.map(formatFinding);
      const newer = verdict.newer === undefined ? '' : formatNewer(verdict.newer);
      if (lines.length === 0) {
        io.stdout(`ok: ${verdict.summary}, no findings.\n${newer}`);
        return 0;
      }
      const noun = lines.length === 1 ? 'finding' : 'findings';
      io.stdout(
        `${lines.join('\n')}\nfail: ${verdict.summary}, ${String(lines.length)} ${noun}.\n${newer}`,
      );
      return 1;
    },
  };
}
