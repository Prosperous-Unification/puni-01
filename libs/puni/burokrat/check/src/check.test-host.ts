import { type CheckScope, checkoutModule, repositoryScope } from '@puni/shared-checkout';
import type { CommandBrief, CommandExitCode } from '@puni/shared-command';
import { recordsModule } from '@puni/shared-records';
import { type MemoryHost, nodeHostModule } from '@puni/shared-testing';
import { DiBag } from 'di-bag';
import { createCheckCommand } from './check.command';
import type { CheckRequest } from './contract';
import {
  applyRule,
  type CheckRules,
  type Finding,
  type ReferenceReach,
  type Rule,
} from './finding';
import { createLatestRules, createRepositoryCheck } from './repository-check.feature';
import { fixtureAgentsRulesDigest, fixtureCommands } from './repository-pair.test-host';
import { checkRules } from './rule-set.rule';
import { pinAgentsRules } from './rules/entry.rule';

/**
 * {@link checkRules} judging the fixtures' rules section, not this repository's: the
 * `agents.rules` rules made of `digests` in place of the production ones, at the same level.
 */
export function fixtureCheckRules(
  digests: Readonly<Record<number, string>> = { 1: fixtureAgentsRulesDigest },
): CheckRules {
  const state = checkRules.sets['system-state'].filter(({ rule }) => rule.id !== 'agents.rules');
  return {
    ...checkRules,
    sets: {
      ...checkRules.sets,
      'system-state': [
        ...state,
        ...pinAgentsRules(digests).map((rule) => ({ level: 'repository' as const, rule })),
      ],
    },
    agentsRulesDigests: digests,
  };
}

const fixtureRules = fixtureCheckRules();

/** The rule sets of {@link fixtureCheckRules}. */
export const fixtureRuleSets = fixtureRules.sets;

function findAgentsRule(): Rule {
  const found = fixtureRuleSets['system-state'].find(({ rule }) => rule.id === 'agents.rules');
  if (found === undefined) throw new Error('the fixture rule set has no agents.rules');
  return found.rule;
}

/** The one `agents.rules` rule of {@link fixtureRuleSets}. */
export const fixtureAgentsKeepRules: Rule = findAgentsRule();

/** One run of the check command: its exit code and what it printed. */
export interface CheckRun {
  readonly code: CommandExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

/** The version the check host's program source names. */
export const fixtureVersion = '9.8.7';

/**
 * The check module's services, judging by `rules` ({@link fixtureCheckRules} unless given),
 * with the checkout and records modules they need, `commands` as the command catalog and a
 * program of {@link fixtureVersion}, over this machine, or over the memory host services
 * `memory` put in its place. Its owner closes it.
 */
export function openCheckHost(
  memory?: MemoryHost['services'],
  commands: readonly CommandBrief[] = fixtureCommands,
  rules: CheckRules = fixtureRules,
) {
  const machine = DiBag.createBuilder()
    .withInstalledModules([nodeHostModule, checkoutModule, recordsModule])
    .withServices({
      commandCatalog: () => ({ list: () => commands }),
      programSource: () => ({ directory: '/nowhere', version: fixtureVersion }),
    })
    .withServices({ checkRules: () => rules })
    .withServices({ repositoryCheck: createRepositoryCheck, latestRules: createLatestRules })
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
