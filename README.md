# PUNI

**AI agents can write anything. This is what makes them finish it.**

PUNI builds your software, keeps it running, and leaves you the factory. This repository is that
factory: the `puni` CLI and the rules every agent works by. One role plans the work, one does it,
and one judges whether it was done right, so nothing is called finished on an agent's word alone.

**Tell us what you want at [puni.dev](https://puni.dev).**

## Look inside

- The rules every session follows: [`AGENTS.md`](AGENTS.md)
- A map of the code: [`wiki/index/index.md`](wiki/index/index.md)

## Run it

```sh
bun install --frozen-lockfile
bun run puni --help
bun run gate
```
