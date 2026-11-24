---
title: Documentation
read-when: writing documentation, or deciding where a fact, a reason or a procedure belongs
---

# Documentation

This documentation is for agents working in this repository: how to operate within it. Product
documentation, for the people who use puni, serves another audience and purpose; the map does
not route to it and these rules do not shape it.

## What is worth writing

Context costs an agent on every read, and a stale line misleads it more than a missing one. So
write only what an agent cannot infer from the code and would get wrong without: a convention,
a boundary, a reason that still binds, an order of steps. Never write an overview of what the
code already shows, a copy of a fact that has a home, or history.

## Where it goes

AGENTS.md rule 2 orders the homes of a fact. Between its last two: a fact that changes when
exactly one library changes is JSDoc on that library's symbols, which `jsdoc/require-jsdoc`
gives every export; only what spans libraries is a wiki page.

## How an agent finds it

Each layer is short, and names the next:

1. `AGENTS.md`, read every session: the rules, the gate, and the map's command.
2. The root of the map, `bun run puni burokrat wiki map`, which the `SessionStart` hook of
   `.claude/settings.json` prints into every Claude Code session (or the error that stopped it
   and how to fix it): a "Read when" line per page, by section, and a line per top-level partition.
3. A section or partition, `bun run puni burokrat wiki map <name>`: a "Read when" line per page,
   or per library placed there, linking its `readFirst`, and the partitions below.
4. The page, or the library's `readFirst` file and the JSDoc on its exports.

The map is printed, never committed: [render-map.ts](../../libs/puni/shared/checkout/src/render-map.ts)
says how each level is laid out. A library's partition is its `metadata.index`, else its
`scope:<name>` tag; the `map` of `puni.json` gives each partition's purpose.

A "Read when" line names the task that should open the file, not what the file holds: it is the
only text an agent weighs before choosing.

## Pages

A page answers one "Read this when …", given as `read-when` in its front matter, within
`pageWordBudget` words. It lives directly in `wiki/` or in one of the sections `wikiSections`
names; the map lists each section with what its pages are for.

A page links to the symbol, test or config entry that holds a fact rather than restating it.

## How it stays true

The gate judges the documentation as it judges code: the `docs`, `links` and `index` rules of
[rule-set.rule.ts](../../libs/puni/burokrat/check/src/rule-set.rule.ts) resolve its links and
paths, its commands and the symbols it names, and hold each page to a section, a `read-when`
and its budget. What no check can judge is the change's: a change that makes a line untrue
rewrites or deletes it in the same commit, as
[documenting a change](../how-to/document-a-change.md) says.
