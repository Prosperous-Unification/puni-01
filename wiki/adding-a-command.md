---
title: Adding a command
read-when: adding a command or a command group
---

# Adding a command

A command line is `puni <role> <group> [<sub-group>] <leaf>`; each group is one library, and
[architecture](architecture.md) says what each kind of file may do. The worked examples are
`libs/puni/dash/ops` (a sub-group of two leaves) and `libs/puni/burokrat/check` (a group that is
itself the leaf). For a leaf in an existing group, that group's own files are the model; read
them before writing yours.

## A leaf in an existing group

In the group's library (the first leaf of a group with none also adds the files that step 3 of
[a new group library](#a-new-group-library) lists for a group with leaves, and step 5 there):

1. `contract.ts`: the request type `{ readonly kind: '<sub-group> <leaf>'; … }`, any new
   capability, and the command key in the `…Exports` interface: `<role><Group><Leaf>Command`.
2. `<leaf>.command.ts`: export `<leaf>Parser`, an Optique parser yielding the request, and
   `create<Leaf>Command`, a factory destructuring what it uses and returning a `Command` whose
   `run(request, io)` writes through `io` and returns the exit code. JSDoc says every outcome.
3. The work goes in a `.feature.ts` with its rules and resources, failures in `failures.ts`. A leaf
   that only prints needs none. A leaf that files a record needs none either: its
   `<leaf>.command.ts` names a `RecordAddLeaf` (kind, default sections, help words) and builds its
   parser and factory with `recordAddParser` and `createRecordAddCommand` of
   `@puni/shared-records`, whose `recordFiling` is its one requirement, as `plan add` does.
4. `group.ts`: add `command('<leaf>', <leaf>Parser, { brief })` to the sub-group's `or(…)`, adding
   the `or` if it held one leaf; the first leaf replaces the `constant` parser with
   `map(optional(command(…)), (leaf) => leaf ?? helpRequest)`, as `libs/puni/navigator/plan` does. The brief, one sentence in Optique's `message` template, is the
   leaf's line in help and the index. If the new leaf makes the group's brief or its library's
   `readWhen` untrue, rewrite them.
5. `module.ts`: register each service in a `withServices` after those it uses; add the command key
   to `exportedServiceKeys`. `module.check.ts`: supply any new requirement.

In `apps/puni/cli/src`:

6. `root-parser.ts`: a `Leaf` member of kind `'<role> <sub-group> <leaf>'`, its `handlerKeys`
   entry, and a case in the role's `select…Leaf`.
7. `main.ts`: the kind's case in the `switch` of `runPuni`.

Tests, one per seam:

8. The library test, beside the group's existing one: the module and the shared modules it
   requires in `withInstalledModules`, over `memoryHost(tree, options).services`, closed through
   `closeAfterEach`; resolve the command key and run requests against a collecting `Io`, covering
   every outcome. `MemoryHostOptions` injects defects (`gitFailure`) and fixed values (`now`,
   `heads`).
9. `apps/puni/cli/src/group-parsers.test.ts`: the leaf's lines parse; bad ones are refused.
10. Update the tests pinning the tree: `root-parser.test.ts` (`--help lists`, `listCommands`),
    `composition.test.ts` (`exportedKeys`, sorted) and `main.test.ts` (the `failing` container,
    which provides every command key).
11. A spawned run, as in `apps/puni/cli/src/ops-entrypoint.test.ts`, for the real streams and exit
    code. Spawn with `CLAUDECODE` and `AGENT` set to `0`, because Bun changes its output under
    agents.

Then:

12. `bun run fix` regenerates `wiki/index/` and formats.
13. `bun run gate` must exit 0.

## A new group library

1. `libs/puni/<role>/<group>/project.json` and `tsconfig.json`, shaped like those of
   `libs/puni/dash/ops`: name `puni-<role>-<group>`, tags `scope:<role>` and `type:group`, the
   targets `test`, `lint`, `typecheck` and `puni-bur-check` as empty objects, and `metadata`:
   - `readWhen` completes "Read this when …": lower-case start, no full stop, at most 20 words. It
     is the library's line in `wiki/index/<role>.md`, which holds at most 400 words. While the
     group has no leaves it says what the group is for: "adding a command that …".
   - `readFirst`: the path, relative to the project, of the file to read first: the group's
     `group.ts` until the group has a feature.
2. `tsconfig.base.json`: the alias `@puni/<role>-<group>` for its `index.ts` in `paths`.
3. Its source: `group.ts` exporting `<group>Parser` (a group that is itself the leaf exports its
   command's parser instead) and `index.ts`, exporting only the `…Exports` type, the parser and
   the module. A group with no leaves yet has only these two, its parser `constant` of the help
   request, and a `group.test.ts` that the bare group parses to it. With leaves it adds
   `contract.ts` with requests, capabilities, `…Requirements` and `…Exports`; `failures.ts` when
   needed; the commands and features of steps 1–3 above; `module.ts` labelled with the project
   name; and `module.check.ts`.
4. `root-parser.ts`: `command('<group>', <group>Parser, { brief })` in the role's parser, inside an
   `or(…)` once the role has two groups; then step 6 per leaf.
5. `composition.ts`, once it has a module: the module in the last `withInstalledModules`. A
   requirement no module provides belongs in a shared library.
6. `main.ts`, once it has leaves: the `…Exports` type in `CommandExports`, then step 7 per leaf.
   A bare group needs no case: `runPuni` prints the help of every help request.
7. Tests as in steps 8–11, and the bare group in `main.test.ts`'s `a bare %s prints its help`.
8. `bun run fix`, then `bun run gate`.
