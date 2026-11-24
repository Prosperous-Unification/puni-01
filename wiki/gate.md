---
title: The gate
read-when: the gate fails, a finding names a rule you do not know, or you change what the gate runs
---

# The gate

Nx owns the task graph: affected projects, caching, ESLint under `lint`, and the sync generator
keeping `wiki/index/` current; `bun fmt` formats. Burokrat judges what no tool knows:
`puni burokrat check` applies the rules of
[rule-set.rule.ts](../libs/puni/burokrat/check/src/rule-set.rule.ts), whose JSDoc says which run
per project, which across projects and which only on the whole repository. The `gate` and
`gate:affected` scripts of [package.json](../package.json) order it all: `bun run gate` judges
everything, and `bun run gate:affected` only what a change affects, through the cached
`puni-bur-check` and the uncached `puni-bur-links` targets. CI runs `gate:affected` on a pull
request and `gate` on everything else, as [ci.yml](../.github/workflows/ci.yml) says.

## When it fails

`bun run gate` runs its steps in order and stops at the first that fails.

- **`nx sync:check`** names a stale or hand-made file under `wiki/index/`: run `bun run fix`. If
  the generator itself fails, fix what its message names; never remove it from `nx.json` as Nx
  suggests (the `nx.sync` rule refuses its absence).
- **`bun fmt --check`**: run `bun run fix`.
- **`puni burokrat check`** prints `<rule> <path>: <message>; fix: <remedy>`. Do what the remedy
  says. The rule's JSDoc, in `libs/puni/burokrat/check/src/rules/`, says what it judges; word
  budgets and other limits are named constants in `libs/puni/burokrat/check/src/budgets.ts`.
- **`puni burokrat check --commits <base>..<head>`** runs in `gate:affected` over a pull
  request's commits, in CI's `pushed-commits` job over every push to any branch or tag, and over
  a merge group. It prints `<rule> <commit>:<path>: <message>; fix: <remedy>`: that commit adds a
  credential or an address, in a file, a file name (`(paths)`) or its message
  (`(commit message)`), though a later commit may have removed it. A pushed commit is public, so
  rotate a credential first, then do what the remedy says: rewrite an unmerged branch, or, with
  `--merged` (main and tags), open a pull request removing it. Locally it needs `NX_BASE`:
  `NX_BASE=origin/main bun run gate:affected`.
- **lint, typecheck, test or build**: Nx names the failed task. Re-run it alone to see its output:
  `bunx nx run <project>:<target> --output-style=static`. Lint messages say which rule of
  `eslint.config.js` refused the code and why.
- **Exit code 3** is an unexpected failure: the `error:` line names a report file holding the
  failure and its causes.

The pre-commit hook runs only `puni burokrat check --staged`, credentials and addresses in the
staged files; CI judges everything else.

Fix the work, not the check. Raising a budget, skipping a test or disabling a rule weakens the
gate, which only the owner decides.
