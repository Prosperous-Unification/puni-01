---
puni-doc-type: wiki-page
title: Dependency injection
read-when: giving a library services, or deciding what it requires and exports
---

# Dependency injection

The container is di-bag. A library with services has `module.ts`, one sealed module labelled with
its project name, and `module.check.ts`, which installs it beside a typed fixture per requirement
and ends in `verifyGraphAtCompileTime() satisfies void`;
[layout.test.ts](../../tests/layout.test.ts) refuses a library with services and without both.

- `contract.ts` declares the module's `…Requirements`, what it needs from the graph, and its
  `…Exports`, what it offers. Exported keys carry the library's prefix, so two libraries never
  export the same key.
- A requirement no module provides belongs in a shared library; host services come from
  `libs/puni/shared/adapters`.
- `module.ts` registers each service in a withServices call after those it uses, and lists the keys
  it exports.

[composition.ts](../../apps/puni/cli/src/composition.ts) is the one graph: host services, shared
modules, then group modules, resolved lazily. `composition.check.ts` verifies it at compile time;
`composition.test.ts` resolves every exported key. How a test installs a module is
[writing a test](../how-to/write-a-test.md).
