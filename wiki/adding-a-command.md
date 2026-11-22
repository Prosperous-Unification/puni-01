---
title: Adding a command
read-when: adding a command or a command group
---

# Adding a command

A command line is `puni <role> <group> [<sub-group>] <leaf>`; each group is one library, and
[architecture](architecture.md) says what each kind of file may do. The worked examples are
`libs/puni/dash/ops` (a sub-group of two leaves) and `libs/puni/burokrat/check` (a group that is
itself the leaf). Read their matching files before writing yours.

## A leaf in an existing group

In the group's library:

1. `contract.ts`: the request type `{ readonly kind: '<sub-group> <leaf>'; … }`, any new
   capability, and the command key in the `…Exports` interface: `<role><Group><Leaf>Command`.
2. `<leaf>.command.ts`: export `<leaf>Parser`, an Optique parser yielding the request, and
   `create<Leaf>Command`, a factory destructuring what it uses and returning a `Command` whose
   `run(request, io)` writes through `io` and returns the exit code. JSDoc says every outcome.
3. The work goes in a `.feature.ts` with its rules and resources, failures in `failures.ts`. A leaf
   that only prints needs none.
4. `group.ts`: add `command('<leaf>', <leaf>Parser, { brief })` to the sub-group's `or(…)`, adding
   the `or` if it held one leaf. The brief, one sentence in Optique's `message` template, is the
   leaf's line in help and the index.
5. `module.ts`: register each service in a `withServices` after those it uses; add the command key
   to `exportedServiceKeys`. `module.check.ts`: supply any new requirement.

In `apps/puni/cli/src`:

6. `root-parser.ts`: a `Leaf` member of kind `'<role> <sub-group> <leaf>'`, its `handlerKeys`
   entry, and a case in the role's `select…Leaf`.
7. `main.ts`: the kind's case in the `switch` of `runPuni`.

Tests, one per seam:

8. The library test, modelled on `libs/puni/dash/ops/src/ops.test.ts`: a container from
   `withInstalledModules` and `memoryHost(tree).services`, closed through `closeAfterEach`; resolve
   the command key and run requests against a collecting `Io`, covering every outcome.
9. `apps/puni/cli/src/group-parsers.test.ts`: the leaf's lines parse; bad ones are refused.
10. Update the tests pinning the tree: `root-parser.test.ts` (`--help lists`, `listCommands`),
    `composition.test.ts` (`exportedKeys`) and `main.test.ts` (the `failing` container, which
    provides every command key).
11. A spawned run, as in `apps/puni/cli/src/ops-entrypoint.test.ts`, for the real streams and exit
    code.

Then:

12. `bun run fix` regenerates `wiki/index/index.md` and formats.
13. `bun run gate` must exit 0.

## A new group library

1. `libs/puni/<role>/<group>/project.json` and `tsconfig.json`, shaped like those of
   `libs/puni/dash/ops`: name `puni-<role>-<group>`, tags `scope:<role>` and `type:group`, the
   targets `test`, `lint`, `typecheck` and `puni-bur-check` as empty objects, and `metadata`:
   - `readWhen` completes "Read this when …": lower-case start, no full stop, at most 20 words. It
     is the library's index line, and the index holds at most 400 words.
   - `readFirst`: the path, relative to the project, of the file to read first.
2. `tsconfig.base.json`: the alias `@puni/<role>-<group>` for its `index.ts` in `paths`.
3. Its source: `contract.ts` with requests, capabilities, `…Requirements` and `…Exports`;
   `failures.ts` when needed; the commands and features of steps 1–3 above; `group.ts` exporting
   `<group>Parser` when leaves sit below the group (a group that is itself the leaf exports its
   command's parser instead); `module.ts` labelled with the project name; `module.check.ts`; and
   `index.ts`, exporting only the `…Exports` type, the parser and the module.
4. `root-parser.ts`: `command('<group>', <group>Parser, { brief })` in the role's parser, inside an
   `or(…)` once the role has two groups; then step 6 per leaf.
5. `composition.ts`: the module in the last `withInstalledModules`. A requirement no module
   provides belongs in a shared library.
6. `main.ts`: the `…Exports` type in `CommandExports`, then step 7 per leaf.
7. Tests as in steps 8–11, and the bare group in `main.test.ts`'s `a bare %s prints its help`.
8. `bun run fix`, then `bun run gate`.
