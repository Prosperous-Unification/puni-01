---
title: Adding a command
read-when: adding a leaf command to a group that already has a library
---

# Adding a command

A command line is `puni <role> <group> [<sub-group>] <leaf>`; each group is one library, and
[file kinds](../concepts/kinds.md) says what each kind of file may do. The worked examples are
`libs/puni/dash/ops` (a sub-group of two leaves) and `libs/puni/burokrat/check` (a group that is
itself the leaf). The group's own files are the model; read them before writing yours. A group
with no library yet starts at [adding a group](add-a-group.md).

## In the group's library

The first leaf of a group with none also adds what step 3 of
[adding a group](add-a-group.md#steps) lists for a group with leaves, and step 5 there.

1. `contract.ts`: the request type `{ readonly kind: '<sub-group> <leaf>'; … }`, any new
   capability, and the command key in the `…Exports` interface: `<role><Group><Leaf>Command`.
2. `<leaf>.command.ts`: export `<leaf>Parser`, an Optique parser yielding the request, and
   `create<Leaf>Command`, a factory destructuring what it uses and returning a [`Command`](../../libs/puni/shared/command/src/command.ts#Command) whose
   `run(request, io)` writes through `io` and returns the exit code. JSDoc says every outcome.
3. The work goes in a `.feature.ts` with its rules and resources, failures in `failures.ts`. A leaf
   that only prints needs none; a leaf that files a record builds on `@puni/shared-records`, as
   `plan add` does.
4. `group.ts`: add `command('<leaf>', <leaf>Parser, { brief })` to the sub-group's `or(…)`, adding
   the `or` if it held one leaf; the first leaf replaces the `constant` parser with
   `map(optional(command(…)), (leaf) => leaf ?? helpRequest)`, as `libs/puni/navigator/plan`
   does. The brief, one sentence in Optique's `message` template, is the leaf's line in help. If the new leaf makes the group's brief untrue, rewrite it; if it makes the
   library's `readWhen` or `readFirst` untrue, rewrite them as
   [documentation](../concepts/documentation.md#how-an-agent-finds-it) says.
5. `module.ts`: register each service and add the command key to `exportedServiceKeys`, as
   [dependency injection](../concepts/dependency-injection.md) says. `module.check.ts`: supply
   any new requirement.

## In the app

In `apps/puni/cli/src`:

6. `root-parser.ts`: what the JSDoc of [`puniParser`](../../apps/puni/cli/src/root-parser.ts#puniParser) asks of a new leaf, its kind being its
   words after the program, as `'dash ops ssh'` and `'burokrat check'` are.
7. `main.ts`: the kind's case in the `switch` of [`runPuni`](../../apps/puni/cli/src/main.ts#runPuni).

## Tests

Each seam as [writing a test](write-a-test.md) says:

8. The library test, beside the group's existing one, covering every outcome of the leaf.
9. `apps/puni/cli/src/group-parsers.test.ts`: the leaf's lines parse; bad ones are refused.
10. The tests pinning the tree: `root-parser.test.ts` (`--help lists`, [`listCommands`](../../libs/puni/shared/command/src/command-catalog.ts#listCommands)),
    `composition.test.ts` (`exportedKeys`, sorted) and `main.test.ts` (the `failing` container,
    which provides every command key).
11. A run of the leaf over real repositories, in process: its group's `*-commands.test.ts` in
    `apps/puni/cli/src`, through [`openInProcessPuni`](../../apps/puni/cli/src/in-process.test-host.ts#openInProcessPuni). Spawn the entrypoint only for what a
    process alone shows, as `ops-entrypoint.test.ts` does for a child attached to the terminal.

Then `bun run fix`, which formats, and `bun run gate`, which must exit 0.
