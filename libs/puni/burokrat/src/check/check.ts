import { constant, object } from '@optique/core';
import { compareBytes, findRepositoryRoot, RepositoryDefect } from '../repository';
import type { CommandBrief } from '../wiki/wiki-index';
import { formatFinding } from './finding';
import { rules } from './rules';

/** `check`: judges the repository against every rule in {@link rules}. Takes no flags. */
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
 * Runs `check` against the repository found from `context.cwd`. Prints each finding as
 * `<rule-id> <path>: <message>`, sorted, then a summary line, and returns 1; with no finding it
 * prints one `ok` line and returns 0. A missing `nx.json` is a `repository.root` finding.
 */
export function runCheck(context: CheckContext): 0 | 1 {
  let lines: string[];
  try {
    const root = findRepositoryRoot(context.cwd);
    lines = rules
      .flatMap((rule) => rule({ root, commands: context.commands }))
      .map(formatFinding)
      .sort(compareBytes);
  } catch (cause) {
    if (!(cause instanceof RepositoryDefect)) throw cause;
    lines = [formatFinding({ rule: 'repository.root', path: '.', message: cause.message })];
  }
  if (lines.length === 0) {
    context.stdout(`ok: ${String(rules.length)} rules, no findings.\n`);
    return 0;
  }
  const noun = lines.length === 1 ? 'finding' : 'findings';
  context.stdout(`${lines.join('\n')}\n${String(lines.length)} ${noun}.\n`);
  return 1;
}
