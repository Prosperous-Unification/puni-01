---
title: The gate
read-when: the gate fails, a finding names a rule you do not know, or you change what the gate runs
---

# The gate

Nx owns the task graph: affected projects, caching, formatting, ESLint under `lint`, and the sync
generator keeping `wiki/index/` current. Burokrat judges what no tool knows: `puni burokrat
check` applies the rules of
[rule-set.rule.ts](../libs/puni/burokrat/check/src/rule-set.rule.ts), whose JSDoc says which run
per project and which only on the whole repository. The `gate` and `gate:affected` scripts of
[package.json](../package.json) order it all: `bun run gate` judges everything, and
`bun run gate:affected` only what a change affects, through the cached `puni-bur-check` and
`puni-bur-links` targets. The rules that read the whole repository (`index.current`,
`docs.symbols`) run only in `bun run gate`, which CI runs.

## When it fails

`bun run gate` runs its steps in order and stops at the first that fails.

- **`nx sync:check`** names a stale or hand-made file under `wiki/index/`: run `bun run fix`. If
  the generator itself fails, fix what its message names; never remove it from `nx.json` as Nx
  suggests (the `nx.sync` rule restores it).
- **`bun fmt --check`**: run `bun run fix`.
- **`puni burokrat check`** prints `<rule> <path>: <message>; fix: <remedy>`. Do what the remedy
  says. The rule's JSDoc, in `libs/puni/burokrat/check/src/rules/`, says what it judges; word
  budgets and other limits are named constants in `libs/puni/burokrat/check/src/budgets.ts`.
- **lint, typecheck, test or build**: Nx names the failed task. Re-run it alone to see its output:
  `bunx nx run <project>:<target> --output-style=static`. Lint messages say which rule of
  `eslint.config.js` refused the code and why.
- **Exit code 3** is an unexpected failure: the `error:` line names a report file holding the
  failure and its causes.

Fix the work, not the check. Raising a budget, skipping a test or disabling a rule weakens the
gate, which only the owner decides.
