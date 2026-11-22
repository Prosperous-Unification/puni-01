---
title: Architecture
read-when: deciding where new code goes, or which kind a file is
---

# Architecture

## Kinds

Every source file but a test has one kind: its suffix, or a wiring name at a library's source root.

- **command** (`.command.ts`): one leaf's Optique parser, and a handler from the parsed request to
  a feature call, output and an exit code.
- **feature** (`.feature.ts`): one capability a user asks for, returning a modelled outcome.
- **rule** (`.rule.ts`): one judgement, from a reading to findings.
- **resource** (`.resource.ts`): the invariants of one aggregate.
- **repository** (`.repository.ts`): runtime access implementing a port, in
  `libs/puni/shared/adapters`.
- **port** (`.port.ts`): an interface a repository implements, in `libs/puni/shared/ports`.
- **wiring**: `contract.ts`, `failures.ts`, `group.ts`,
  `index.ts`, `module.ts`, `module.check.ts`.
- **domain**: any other name; pure code importing no kind and no runtime.

The direction is command → feature → rule → resource → port. A command sees its feature only as a
`contract.ts` type; `module.ts` joins them. Only repositories and the app reach the runtime,
ambient time included: code that needs the time declares `clock: Clock` in its requirements, as
`records.resource.ts` does. `forbiddenKinds` and `forbiddenByWiring` in
[eslint.config.js](../eslint.config.js) hold the exact lists.

## Libraries

- **app**: `apps/puni/cli` (`scope:app`), only `entrypoint.ts`, `main.ts`, `root-parser.ts`,
  `composition.ts` and `composition.check.ts`.
- **shared**: `libs/puni/shared/*` (`scope:shared`); of these only `checkout` and `records` have a
  `module.ts`.
- **group**: one library per command group at `libs/puni/<role>/<group>` (`scope:<role>`,
  `type:group`); the roles are navigator, dash and burokrat.

A library imports another only through its `@puni/*` alias in `tsconfig.base.json`. Group and
shared libraries but testing import only shared libraries, never the adapters, and the testing library only
from tests; groups meet only in the app. `moduleBoundaries` in [eslint.config.js](../eslint.config.js) states this for
`@nx/enforce-module-boundaries`, which needs the Nx project graph, so the Nx `lint` target judges
it.

## Dependency injection

The container is di-bag. A library with services has `module.ts`, one sealed module labelled with
its project name, and `module.check.ts`, which installs it
beside a typed fixture per requirement and ends in `verifyGraphAtCompileTime() satisfies void`.
Exported keys carry the library's prefix.

[composition.ts](../apps/puni/cli/src/composition.ts) is the one graph: host services, shared
modules, then group modules, resolved lazily. `composition.check.ts` verifies it at compile time;
`composition.test.ts` resolves every exported key. A library
test installs its module over `memoryHost(tree).services` from `@puni/shared-testing`, closing
containers through `closeAfterEach`; app tests swap host services with
`createIndependentContainer`.

## Failures

A modelled failure is a `defineException` kind tagged `puni/<library>/<Kind>` in `failures.ts`. A
repository defect carries `rule` and `path` and is paired with its remedy by `remedyDefect`; a
feature maps it to a finding or outcome with `findDefect`. Exit codes:

- 0: success.
- 1: a judgement failed, or the repository's inputs are defective.
- 2: the command line is refused, or names something the repository lacks.
- 3: an unexpected failure.

A pass-through command (`dash ops ssh`) returns the remote exit code once `ssh` started. Expected
failures print one `error:` line on stderr. Anything else propagates to
[entrypoint.ts](../apps/puni/cli/src/entrypoint.ts), the one catch-all: it writes a bounded,
redacted report to `<os tmpdir>/puni-failures-<uid>/<reference>.json` (to stderr when
`PUNI_FAILURE_REPORT=stderr`), prints `error: unexpected failure, reference <id>, report <where>`
and sets exit code 3. Nothing calls `process.exit`.

## Nx and Burokrat

Nx owns the task graph: affected projects, caching, target defaults in [nx.json](../nx.json),
formatting, ESLint under `lint`, and the sync generator keeping `wiki/index/index.md` current.
Burokrat judges what no tool knows: `puni burokrat check` applies the rules in
[rule-set.rule.ts](../libs/puni/burokrat/check/src/rule-set.rule.ts), each finding printed as
`<rule> <path>: <message>; fix: <remedy>`. Repository- and project-level rules run per project as
the cached `puni-bur-check` target, cross-project links as `puni-bur-links`, and `index.current`
only in the whole check. The `gate` script of [package.json](../package.json) orders it all.
