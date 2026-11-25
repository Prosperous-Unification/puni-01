---
title: Adding a group
read-when: adding a command group that has no library yet
---

# Adding a group

Each command group is one library at `libs/puni/<role>/<group>`, shaped as
[libraries](../concepts/libraries.md) says. `libs/puni/dash/ops` is the model for one with leaves;
a planned group with none, such as `libs/puni/dash/mcp`, for one without.

## Steps

1. `libs/puni/<role>/<group>/project.json` and `tsconfig.json`, shaped like those of
   `libs/puni/dash/ops`: name `puni-<role>-<group>`, tags `scope:<role>` and `type:group`, the
   targets `test`, `lint`, `typecheck` and `puni-bur-check` as empty objects, and `metadata`
   with `readWhen` and `readFirst` as
   [documentation](../concepts/documentation.md#how-an-agent-finds-it) says. While the group
   has no leaves, `readWhen` says what it is for ("adding a command that …") and `readFirst` is
   its `group.ts`.
2. `tsconfig.base.json`: the alias `@puni/<role>-<group>` for its `index.ts` in `paths`.
3. Its source: `group.ts` exporting `<group>Parser` (a group that is itself the leaf exports its
   command's parser instead) and `index.ts`, exporting only the `…Exports` type, the parser and
   the module. A group with no leaves yet has only these two, its parser `constant` of the help
   request, and a `group.test.ts` that the bare group parses to it. With leaves it adds
   `contract.ts`, `failures.ts` when needed, the commands and features of
   [adding a command](add-a-command.md), and `module.ts` with `module.check.ts`.
4. `root-parser.ts`: `command('<group>', <group>Parser, { brief })` in the role's parser, inside an
   `or(…)` once the role has two groups; then step 6 of
   [adding a command](add-a-command.md#in-the-app) per leaf.
5. `composition.ts`, once it has a module: the module in the last `withInstalledModules`.
6. `main.ts`, once it has leaves: the `…Exports` type in `CommandExports`, then step 7 of
   [adding a command](add-a-command.md#in-the-app) per leaf. A bare group needs no case:
   [`runPuni`](../../apps/puni/cli/src/main.ts#runPuni) prints the help of every help request.
7. The [tests](add-a-command.md#tests) of each leaf, and the bare group in `main.test.ts`'s
   `a bare %s prints its help`.
8. `bun run fix`, then `bun run gate`.
