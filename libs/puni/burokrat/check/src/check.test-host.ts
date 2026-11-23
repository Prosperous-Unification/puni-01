import { type CheckScope, checkoutModule, repositoryScope } from '@puni/shared-checkout';
import type { CommandBrief, CommandExitCode } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { type MemoryHost, nodeHostModule } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { createCheckCommand } from './check.command';
import type { CheckRequest } from './contract';
import { applyRule, type Finding, type ReferenceReach, type Rule } from './finding';
import { createRepositoryCheck } from './repository-check.feature';
import { fixtureAgentsRulesDigest, fixtureCommands } from './repository-pair.test-host';
import { ruleSets } from './rule-set.rule';
import { agentsKeepRules, pinAgentsRules } from './rules/entry.rule';

/** `agents.rules` pinned to the fixtures' rules section, not this repository's. */
export const fixtureAgentsKeepRules = pinAgentsRules(fixtureAgentsRulesDigest);

/** {@link ruleSets} with {@link fixtureAgentsKeepRules} in place of the production `agents.rules`. */
export const fixtureRuleSets: typeof ruleSets = {
  'system-state': ruleSets['system-state'].map(({ level, rule }) => ({
    level,
    rule: rule === agentsKeepRules ? fixtureAgentsKeepRules : rule,
  })),
  'system-records': ruleSets['system-records'],
};

/** One run of the check command: its exit code and what it printed. */
export interface CheckRun {
  readonly code: CommandExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The check module's services, judging by {@link fixtureRuleSets}, with the checkout and records
 * modules they need and `commands` as the command catalog, over this machine, or over the memory host services `memory` put in its place. Its
 * owner closes it.
 */
export function openCheckHost(
  memory?: MemoryHost['services'],
  commands: readonly CommandBrief[] = fixtureCommands,
) {
  const machine = DiBag.createBuilder()
    .withInstalledModules([nodeHostModule, checkoutModule, recordsModule])
    .withServices({ commandCatalog: () => ({ list: () => commands }) })
    .withServices({ checkRuleSets: () => fixtureRuleSets })
    .withServices({ repositoryCheck: createRepositoryCheck })
    .withServices({ burokratCheckCommand: createCheckCommand })
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
