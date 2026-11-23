---
title: When the gate fails
read-when: the gate fails, or a finding names a rule you do not know
---

# When the gate fails

`bun run gate` runs its steps in order and stops at the first that fails.

- **`nx sync:check`** names a stale or hand-made file under `wiki/index/`: run `bun run fix`. If
  the generator itself fails, fix what its message names; never remove it from `nx.json` as Nx
  suggests (the `nx.sync` rule restores it).
- **`nx format:check`**: run `bun run fix`.
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
