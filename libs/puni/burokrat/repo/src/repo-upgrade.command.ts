import { constant, object } from '@optique/core';
import { repositoryTypes } from '@puni/shared-checkout';
import type { Command } from '@puni/shared-command';
import { formatFinding } from '@puni/shared-failures';
import type { RepoUpgradeRequest, RulesPinUpgrade } from './contract';

/** `upgrade`: takes no options. */
export const upgradeParser = object({ kind: constant('repo upgrade') });

/**
 * The `repo upgrade` command: raises the `rules` pin of the system-state repository it stands in
 * to the latest epoch this puni knows. Upgraded, it prints `upgraded: rules epoch <old> -> <new>`
 * and returns 0; already at the latest, one `ok: ` line saying so and 0. When a repository of
 * the project fails the latest rules it prints, for each such repository, its findings as
 * `check` does and a `fail: ` line naming it, then the line saying the pin stays, changes
 * nothing and returns 1. A pin past the latest, or a source checkout holding an older epoch's
 * rules, prints one `error: ` line and returns 2; a repository or source checkout that cannot be
 * read, one `error: ` line and 1.
 */
export function createRepoUpgradeCommand({
  rulesPinUpgrade,
}: {
  rulesPinUpgrade: RulesPinUpgrade;
}): Command<RepoUpgradeRequest> {
  return {
    run(_request, io) {
      const outcome = rulesPinUpgrade.upgrade(io.cwd);
      switch (outcome.kind) {
        case 'upgraded':
          io.stdout(`upgraded: rules epoch ${String(outcome.from)} -> ${String(outcome.to)}\n`);
          return 0;
        case 'current':
          io.stdout(
            `ok: rules epoch ${String(outcome.epoch)} is already the latest this puni knows\n`,
          );
          return 0;
        case 'failing': {
          const { findings, from, to } = outcome;
          const blocks = repositoryTypes.flatMap((type) => {
            const found = findings[type];
            if (found.length === 0) return [];
            const noun = found.length === 1 ? 'finding' : 'findings';
            return [
              ...found.map(formatFinding),
              `fail: ${type} at rules epoch ${String(to)}, ${String(found.length)} ${noun}.`,
            ];
          });
          io.stdout(`${blocks.join('\n')}\npuni.json stays at rules epoch ${String(from)}.\n`);
          return 1;
        }
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
