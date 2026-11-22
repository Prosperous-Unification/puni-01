import { type CheckScope, checkoutModule, repositoryScope } from '@puni/shared-checkout';
import type { CommandBrief, CommandExitCode } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { fixtureCommands, nodeHost } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { CheckRequest } from './contract';
import type { Finding, Rule } from './finding';
import { burokratCheckModule } from './module';

/** One run of the check command: its exit code and what it printed. */
export interface CheckRun {
  readonly code: CommandExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The check module over `host` (this machine by default) with the checkout and records modules
 * it needs and `commands` as the command catalog. Its owner closes it.
 */
export function openCheckHost(
  host: ReturnType<typeof nodeHost> = nodeHost(),
  commands: readonly CommandBrief[] = fixtureCommands,
) {
  const container = DiBag.createBuilder()
    .withInstalledModules([checkoutModule, recordsModule, burokratCheckModule])
    .withServices(host)
    .withServices({ commandCatalog: () => ({ list: () => commands }) })
    .buildContainer();
  return {
    container,
    /** Runs `rule` on the checkout at `root`, with the registry found from `registryRoot`. */
    judge(
      rule: Rule,
      root: string,
      registryRoot: string = root,
      scope: CheckScope = repositoryScope,
    ): Finding[] {
      return rule({
        files: container.resolve('checkoutFiles').open(root),
        registry: container.resolve('checkoutRegistry').locate(registryRoot).registry,
        commands,
        scope,
        wikiIndex: container.resolve('checkoutWikiIndex'),
        records: container.resolve('recordsCatalog'),
      });
    },
    /** Runs `puni burokrat check` with `request` from `cwd`. */
    runCheck(request: CheckRequest, cwd: string): CheckRun {
      let stdout = '';
      let stderr = '';
      const code = container.resolve('burokratCheckCommand').run(request, {
        cwd,
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      });
      return { code, stdout, stderr };
    },
    close: () => container.close(),
  };
}

/** What {@link openCheckHost} returns. */
export type CheckHost = ReturnType<typeof openCheckHost>;
