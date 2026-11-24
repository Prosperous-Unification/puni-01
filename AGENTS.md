# puni-01

The PUNI platform: the `puni` CLI and the rules it enforces on every
repository it governs.

## Working here

- The gate is `bun run gate`; `bun run fix` repairs what a tool can. Bun and Nx only.
- Unsure where something lives? `bun run puni burokrat wiki map` prints the
  map from a task to the file to read first.
- Every commit, commit message and pull request here is public: no
  credentials, hostnames, addresses, personal data or record content.
- Records live in <https://github.com/Prosperous-Unification/puni-01-records>,
  cloned beside this repository as `../puni-01-records`; its `AGENTS.md` says
  how to file one. File one when the task asks, or when you decide something
  the code and its commit message cannot carry. Read a record only when a
  task names it.

## Rules

Navigator decides, Dash does, Burokrat judges: you do the work, the task sets
its scope and the gate judges it. Only the owner, the person you work for,
changes these rules; a task overrides one only by naming it.

1. **State, not history.** This repository says what the system is now, and
   why wherever the reason still binds. Its past and its future (plans,
   research, rejected options, evidence) are records. What stops being true
   is deleted, not marked old.
2. **One home for every fact.** Find where a fact lives and change it there.
   A new one goes in the first of these that can hold it: a check or test, a
   type or name, JSDoc on the symbol, a wiki page. Copies are generated,
   never typed.
3. **The task sets the scope.** Deliver all of it and nothing it does not
   need. Where it is unclear, take the smallest reading that does the whole
   job. Propose anything more; do not build it.
4. **Ask only before what cannot be undone:** destroying work outside your
   task, rewriting pushed history, releasing, weakening or bypassing the
   gate. Otherwise assume, act and say what you assumed.
5. **Fail loudly.** What code requires and does not find (a file, a value, a
   tool) is an error that names it. An absence the design expects is a named
   case with a test. You are blocked only when no permitted route is left;
   then report what you tried.
6. **Evidence, not opinion.** Work is done when the gate passes and output
   from a run after your last change shows what was asked for working.
   Behaviour you add or change has a test that fails without it. Another
   agent's report is a claim. Say what you did not verify.
