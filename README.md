# puni-01

The PUNI platform monorepo (Bun, Nx, TypeScript). It ships one CLI, `puni`, whose commands
are grouped by three roles: Navigator decides what to do, Dash does it, Burokrat judges
whether it was done right.

## Command tree

```text
puni
├── navigator   (nav, n)   planning; no commands yet
├── dash        (d)        execution and operations; no commands yet
├── burokrat    (bur, b)   rules and judgement; no commands yet
├── help [COMMAND...]
├── completion SHELL
├── --help
└── --version
```

A bare group prints its help. Exit codes: 0 success, 1 a judgement failed, 2 usage refused.

## Layout

- `apps/puni/cli` composes the groups and owns their names and aliases.
- `libs/puni/{navigator,dash,burokrat}` each export the parser of that role's commands.

## Run

```sh
bun install --frozen-lockfile
bun run puni --help
bun run gate   # format check, lint, typecheck, test, build
```

The built CLI is `dist/apps/puni/cli/puni.js` (`bunx nx build puni-cli`).
