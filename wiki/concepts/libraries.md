---
title: Libraries
read-when: deciding which library new code belongs in, or what one library may import of another
---

# Libraries

Every project is an Nx project whose `scope:<name>` tag is its lint boundary and, unless
`metadata.index` says otherwise, its partition of the map `bun run puni burokrat wiki map`
prints. Three shapes:

- **app**: `apps/puni/cli` (`scope:app`). It only wires: it parses the command line, composes the
  graph and dispatches to commands, so it holds only the files
  [layout.test.ts](../../tests/layout.test.ts) lists and nothing that does work.
- **shared**: `libs/puni/shared/*` (`scope:shared`): what more than one group needs, and the
  host services every group reaches the machine through.
- **plugin**: `libs/puni/shared/nx` (`type:plugin`): the tech-specific side of a shared
  interface, here the map's project source; only the app, which composes it, and tests import it.
- **group**: one library per command group at `libs/puni/<role>/<group>` (`scope:<role>`,
  `type:group`); the roles are navigator, dash and burokrat. Every planned group has its library;
  one with no leaves yet holds only `group.ts`, whose parser accepts the bare group as a help
  request, and `index.ts`.

A library imports another only through its `@puni/*` alias in `tsconfig.base.json`. Groups and
shared libraries import only shared libraries, never the adapters; the testing library is
imported only from tests; groups meet only in the app. `moduleBoundaries` in
[eslint.config.js](../../eslint.config.js) states this, and the Nx `lint` target judges it.

How a library documents itself, and what is left for the wiki, is
[documentation](documentation.md).
