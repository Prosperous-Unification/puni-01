---
title: File kinds
read-when: deciding which kind a new file is, or what a file of a kind may import
---

# File kinds

Every source file but a test has one kind: its suffix, or a wiring name at a library's source
root. The kind says what the file is for; [eslint.config.js](../../eslint.config.js) holds what
each kind may import ([`forbiddenKinds`](../../eslint.config.js#forbiddenKinds),
[`forbiddenByWiring`](../../eslint.config.js#forbiddenByWiring)) and refuses the rest under `lint`.

- **command** (`.command.ts`): one leaf's Optique parser, and a handler from the parsed request to
  a feature call, output and an exit code; or the output and exit codes its group's leaves share;
  or, in `libs/puni/shared/records`, the parser and handler factories every leaf that files a
  record is built from.
- **feature** (`.feature.ts`): one capability a user asks for, returning a modelled outcome.
- **rule** (`.rule.ts`): one judgement, from a reading to findings.
- **resource** (`.resource.ts`): the invariants of one aggregate.
- **repository** (`.repository.ts`): runtime access implementing a port, in
  `libs/puni/shared/adapters`.
- **port** (`.port.ts`): an interface a repository implements, in `libs/puni/shared/ports`.
- **wiring**: `contract.ts`, `failures.ts`, `group.ts`, `index.ts`, `module.ts`,
  `module.check.ts`. `module.ts` imports only files of a kind and the wiring, so nothing it
  registers escapes the kind rules.
- **domain**: any other name; pure code importing no kind and no runtime.

The direction is command → feature → rule → resource → port. A command sees its feature only as a
`contract.ts` type; `module.ts` joins them. Only repositories and the app reach the runtime,
ambient time and the console included: library code that needs the time declares `clock: Clock`
in its requirements, as `records.resource.ts` does, and prints only through a command's `Io`.

Which libraries there are and what they may import of each other is
[libraries](libraries.md); how `module.ts` joins the kinds is
[dependency injection](dependency-injection.md).
