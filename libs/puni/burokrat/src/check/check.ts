import { constant, object } from '@optique/core';
import { compareBytes, findRepository, RepositoryDefect } from '../repository';
import type { CommandBrief } from '../wiki/wiki-index';
import { formatFinding } from './finding';
import { ruleSets } from './rules';

/** `check`: judges the repository against the rule set of its kind. Takes no flags. */
export const checkParser = object({ kind: constant('check') });

/** What `check` needs from the app that composes it. */
export interface CheckContext {
  /** Where the repository search starts. */
  readonly cwd: string;
  /** Every command of the composed CLI, for the generated index. */
  readonly commands: readonly CommandBrief[];
  readonly stdout: (text: string) => void;
}

/**
 * Runs `check` against the repository found from `context.cwd`, applying the rule set its
 * `puni.json` kind selects from {@link ruleSets}. Prints each finding as
 * `<rule-id> <path>: <message>`, sorted, then a summary naming the kind, and returns 1; with no
 * finding it prints one `ok` line and returns 0. A missing or invalid `puni.json` is a finding.
 */
export function runCheck(context: CheckContext): 0 | 1 {
  let lines: string[];
  let scope: string;
  try {
    const { root, kind, counterpart } = findRepository(context.cwd);
    const rules = ruleSets[kind];
    scope = `${kind}, ${String(rules.length)} rules`;
    lines = rules
      .flatMap((rule) => rule({ root, counterpart, commands: context.commands }))
      .map(formatFinding)
      .sort(compareBytes);
  } catch (cause) {
    if (!(cause instanceof RepositoryDefect)) throw cause;
    scope = 'no repository';
    lines = [formatFinding({ rule: cause.rule, path: cause.path, message: cause.message })];
  }
  if (lines.length === 0) {
    context.stdout(`ok: ${scope}, no findings.\n`);
    return 0;
  }
  const noun = lines.length === 1 ? 'finding' : 'findings';
  context.stdout(`${lines.join('\n')}\nfail: ${scope}, ${String(lines.length)} ${noun}.\n`);
  return 1;
}
