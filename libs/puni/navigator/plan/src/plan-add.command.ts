import { constant, message, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { PlanAddRequest, PlanFiling } from './contract';

/** `add --title TEXT --topics LIST --summary TEXT [--body-file PATH]`: one plan to file. */
export const planAddParser = object({
  kind: constant('plan add'),
  title: option('--title', string({ metavar: 'TEXT' }), {
    description: message`The plan's title, on one line; its file name is made from it.`,
  }),
  topics: option('--topics', string({ metavar: 'LIST' }), {
    description: message`One to five comma-separated topics, such as ops,k3s.`,
  }),
  summary: option('--summary', string({ metavar: 'TEXT' }), {
    description: message`What the plan decides, on one line, at most 30 words.`,
  }),
  bodyFile: optional(
    option('--body-file', string({ metavar: 'PATH' }), {
      description: message`The file holding the plan's body (default: a heading of the title).`,
    }),
  ),
});

/**
 * The `plan add` command: files the plan in the records repository, prints the new record's path
 * relative to that repository and returns 0; it commits nothing. A refused value, title, existing
 * record or body file prints one `error: ` line and returns 2; a defective repository or an
 * unreadable body file one `error: ` line and 1.
 */
export function createPlanAddCommand({
  planFiling,
}: {
  planFiling: PlanFiling;
}): Command<PlanAddRequest> {
  return {
    run(request, io) {
      const outcome = planFiling.file(io.cwd, request);
      switch (outcome.kind) {
        case 'filed':
          io.stdout(`${outcome.path}\n`);
          return 0;
        case 'refused':
          io.stderr(`error: ${outcome.reason}\n`);
          return 2;
        case 'defective':
          io.stderr(`error: ${outcome.reason}\n`);
          return 1;
      }
    },
  };
}
