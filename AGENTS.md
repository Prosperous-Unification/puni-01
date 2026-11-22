# Agent rules

`CLAUDE.md` is a symlink to this file.

## Tooling

- Bun and Nx only. Never npm, pnpm, yarn or npx.
- Never claim a command works without its fresh output.

## What lives here

This repository describes the system as it is now. No dated documents, plans, research,
evidence or decision history belong here, and nothing links to the records repository.

## The `puni` CLI

- Three role groups, nothing else at the top level beyond help, version and completion:
  - `navigator` (`nav`, `n`) decides what to do;
  - `dash` (`d`) does it;
  - `burokrat` (`bur`, `b`) judges whether it was done right.
- Placing a new command: if it decides, it is Navigator's; if it does, Dash's; if it judges,
  Burokrat's. Never add a top-level command.
- One file per leaf command, in its role library under `libs/puni/<role>/src`.
- Exit codes: 0 success, 1 a judgement failed, 2 usage refused.

## Code

- Symbol knowledge is JSDoc on that symbol: behaviour, throws, invariants.
