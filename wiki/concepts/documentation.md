---
puni-doc-type: wiki-page
title: Documentation
read-when: writing documentation, or deciding where a fact, a reason or a procedure belongs
---

# Documentation

This documentation is for agents working in this repository. Product documentation, for the
people who use puni, serves another audience; the map does not route to it and these rules do
not shape it.

## What is worth writing

Context costs an agent on every read, and a stale line misleads it more than a missing one.
Write only what an agent cannot infer from the code and would get wrong without: a convention,
a boundary, a reason that still binds, an order of steps. Never write an overview of what the
code already shows, a copy of a fact that has a home, or history.

## Where it goes

AGENTS.md rule 2 orders the homes of a fact. Between its last two: a fact that changes with
exactly one library is JSDoc on its symbols, which `jsdoc/require-jsdoc` gives every export;
only what spans libraries is a wiki page.

## Document types

Every Markdown file names its `puni-doc-type` in its front matter; the type, not the path,
says where the file may live and which rules judge it.
[`docTypes`](../../libs/puni/shared/checkout/src/doc-types.ts#docTypes) lists the types;
`docs.type` refuses a file declaring none, an unknown or a misplaced one; a record filed
before records declared theirs is one by its place.

## How an agent finds it

Each layer is short, and names the next:

1. `AGENTS.md`, read every session: the rules, the gate, and the map's command.
2. The root of the map, `bun run puni burokrat wiki map`, which the `SessionStart` hook of
   `.claude/settings.json` prints into every Claude Code session (or the error that
   stopped it): a "Read when" line per page, by section, and a line per top-level partition.
3. A section or partition, `bun run puni burokrat wiki map <name>`: a "Read when" line per page
   or library there, linking its `readFirst`, and the partitions below.
4. The page, or the library's `readFirst` file and the JSDoc on its exports.

The map is printed, never committed: [render-map.ts](../../libs/puni/shared/checkout/src/render-map.ts)
lays out each level. A library's partition is its `metadata.index`, else its `scope:<name>`
tag; the `map` of `puni.json` gives each partition's purpose.

A "Read when" line names the task that should open the file, not what it holds: it is the only
text an agent weighs before choosing.

## Pages

A `wiki-page` answers one "Read this when …", its `read-when`, within
[`pageWordBudget`](../../libs/puni/burokrat/check/src/budgets.ts#pageWordBudget) words, in
`wiki/` or a section
[`wikiSections`](../../libs/puni/shared/checkout/src/wiki-sections.ts#wikiSections) names. It
links to the symbol, test or config entry that holds a fact rather than restating it.

## How it stays true

The `docs`, `links` and `index` rules of
[rule-set.rule.ts](../../libs/puni/burokrat/check/src/rule-set.rule.ts) resolve the links,
paths, commands and typed references (`path#name`) of the documentation and of doc comments,
and hold each page to its section, `read-when` and budget. No check judges whether a line
is still true: a change that falsifies one rewrites or deletes it in that commit, as
[documenting a change](../how-to/document-a-change.md) says.
