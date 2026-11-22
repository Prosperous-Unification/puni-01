# puni-01

The PUNI platform: the `puni` CLI and the rules it enforces on every
repository it governs.

## Working here

- `bun run gate` decides whether work is done. Use Bun and Nx only, never npm,
  pnpm or yarn.
- To find anything, start at `wiki/index/index.md`. It maps a task to the one
  file to read.
- History lives in the records repository,
  <https://github.com/Prosperous-Unification/puni-01-records>, checked out
  beside this one as `../puni-01-records`. Read it only when a task names a
  record. This is the only file that links there.

## Rules

1. **State, not history.** Write here only what the system is now. Plans,
   decisions, research, evidence and anything dated go to the records
   repository.
2. **One home for every fact.** Before writing something down, find where it
   already lives and change it there. Put new knowledge beside the thing it
   describes, never in a second place.
3. **Enforce, don't describe.** When a tool can check a rule, add the check
   instead of a sentence, and prove the check can fail.
4. **Evidence before claims.** Report something as working only with fresh
   output that shows it, and say what you did not verify.
5. **Three roles.** Navigator decides, Dash does, Burokrat judges. Place every
   command under the role that fits and add nothing at the top level of the
   CLI.
6. **Build only what was asked.** Add no file, command, document or dependency
   the task did not call for. When more seems needed, ask the owner.
