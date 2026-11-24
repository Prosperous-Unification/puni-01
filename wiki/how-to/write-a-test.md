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
- **A spawned run**, as in `apps/puni/cli/src/ops-entrypoint.test.ts`, for the real streams and
  exit code of the entrypoint. Spawn with `CLAUDECODE` and `AGENT` set to `0`, because Bun changes
  its output under agents. `bundle.test.ts` does the same for the built bundle.
- **A real repository pair**, when the behaviour needs a git that a memory host cannot model:
  `writeProject`, `writeRepositoryFile` and `runGit` of `@puni/shared-testing`, in a directory
  from `removeScratchDirectoriesAfterEach`, which removes only what it created.

A port's contract is one suite every implementation passes: the `*-contract.test.ts` files of
`libs/puni/shared/testing/src` run against both the node adapters and the memory host.
