---
title: Writing a test
read-when: deciding which test proves a change, or how a test reaches a module and the host
---

# Writing a test

A behaviour is proven at the narrowest seam that shows it, and the seams are these. What each
helper does is its JSDoc in `libs/puni/shared/testing/src/index.ts`; a shared or group library's
own tests are the model.

- **A library test**, beside the library's code: the module and the shared modules it requires
  in `withInstalledModules`, over `memoryHost(tree, options).services`, each container opened
  through `closeAfterEach`. Resolve the exported key and run it; a command runs against an `Io`
  that collects its output. `MemoryHostOptions` injects defects and fixed values. Cover every
  outcome the JSDoc names. `libs/puni/dash/ops/src/ops.test.ts` is one.
- **A parser test**, in `apps/puni/cli/src/group-parsers.test.ts`: the lines a leaf accepts, and
  those it refuses.
- **A graph test**, in `apps/puni/cli/src`: `composition.test.ts` resolves every exported key,
  swapping host services with `createIndependentContainer`; `root-parser.test.ts` and
  `main.test.ts` pin the command tree and its dispatch.
- **An in-process run**, as in `apps/puni/cli/src/resources-commands.test.ts`: a command line
  through `runPuni` and the real container of `openInProcessPuni`, over real repositories, its
  output collected. It costs no process start, so every leaf has one.
- **A spawned run**, as in `apps/puni/cli/src/ops-entrypoint.test.ts`, only for what a process
  alone shows: the entrypoint's streams and exit codes, a child attached to the terminal, the
  environment. Spawn with `CLAUDECODE` and `AGENT` set to `0`, because Bun changes its output under
  agents. `bundle.test.ts` does the same for the built bundle.
- **A real repository pair**, when the behaviour needs a git that a memory host cannot model:
  `writeProject`, `writeRepositoryFile` and `runGit` of `@puni/shared-testing`, removed with
  `removeFixture`.

A port's contract is one suite every implementation passes: the `*-contract.test.ts` files of
`libs/puni/shared/testing/src` run against both the node adapters and the memory host.
