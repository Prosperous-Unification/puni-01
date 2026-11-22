import { type CheckScope, checkoutModule, repositoryScope } from '@puni/shared-checkout';
import type { CommandBrief, CommandExitCode } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { type MemoryHost, nodeHostModule } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import type { CheckRequest } from './contract';
import { applyRule, type Finding, type ReferenceReach, type Rule } from './finding';
import { burokratCheckModule } from './module';
import { fixtureCommands } from './repository-pair.test-host';

/** One run of the check command: its exit code and what it printed. */
export interface CheckRun {
  readonly code: CommandExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The check module with the checkout and records modules it needs and `commands` as the command
 * catalog, over this machine, or over the memory host services `memory` put in its place. Its
 * owner closes it.
 */
export function openCheckHost(
  memory?: MemoryHost['services'],
  commands: readonly CommandBrief[] = fixtureCommands,
) {
  const machine = DiBag.createBuilder()
    .withInstalledModules([nodeHostModule, checkoutModule, recordsModule, burokratCheckModule])
    .withServices({ commandCatalog: () => ({ list: () => commands }) })
    .buildContainer();
  const container =
    memory === undefined
      ? machine
      : machine.createIndependentContainer(['fileSystem', 'git', 'processRunner'], memory);
  return {
    container,
    /**
     * Runs `rule` on the checkout at `root`, with the registry found from `registryRoot`; the
     * references it reaches are every one in the whole repository and those within the project
     * in a project scope, unless `references` says otherwise.
     */
    judge(
      rule: Rule,
      root: string,
      registryRoot: string = root,
      scope: CheckScope = repositoryScope,
      references: ReferenceReach = scope.kind === 'repository'
        ? { kind: 'all' }
        : { kind: 'within-project', projects: scope.projects },
    ): Finding[] {
      const located = container.resolve('checkoutRegistry').locate(registryRoot);
      const type = root === located.root ? located.type : 'system-records';
      return applyRule(rule, {
        files: container.resolve('checkoutFiles').open(root, type),
        registry: located.registry,
        commands,
        scope,
        references,
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
    async close() {
      if (container !== machine) await container.close();
      await machine.close();
    },
  };
}

/** A finding as a test compares it, without its remedy. */
export type Judged = Omit<Finding, 'remedy'>;

/** `findings` without their remedies, for tests that judge only where and what. */
export function dropRemedies(findings: readonly Finding[]): Judged[] {
  return findings.map(({ rule, path, message }) => ({ rule, path, message }));
}

/** What {@link openCheckHost} returns. */
export type CheckHost = ReturnType<typeof openCheckHost>;
