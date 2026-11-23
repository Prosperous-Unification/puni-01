---
title: Documentation
read-when: writing documentation, or deciding where a fact, a reason or a procedure belongs
---

# Documentation

This documentation is for agents working in this repository: how to operate within it. Product
documentation, for the people who use puni, serves another audience and purpose; the index does
not route to it and these rules do not shape it.

## What is worth writing

Context costs an agent on every read, and a stale line misleads it more than a missing one. So
write only what an agent cannot infer from the code and would get wrong without: a convention,
a boundary, a reason that still binds, an order of steps. Never write an overview of what the
code already shows, a copy of a fact that has a home, or history.

## Where it goes

A fact has one home, the first of these that can hold it:

1. **A check or test**: the gate enforces it, and its message carries the remedy.
2. **A type or name**: the compiler or the reader's eye carries it.
3. **JSDoc on the symbol**: what a library offers and why. A fact that changes when exactly one
   library changes belongs here. `jsdoc/require-jsdoc` gives every export a comment.
4. **A wiki page**: only what spans libraries.

## How an agent finds it

Each layer is short, and names the next:

1. `AGENTS.md`, read every session: the rules, the gate, and the index.
2. `wiki/index/index.md`, generated: a "Read when" line per page, by section, and one line per
   partition.
3. `wiki/index/<scope>.md`, generated: a "Read when" line per library, linking its `readFirst`.
4. The page, or the library's `readFirst` file and the JSDoc on its exports.

A "Read when" line names the task that should open the file, not what the file holds: it is the
only text an agent weighs before choosing.

## Pages

A page answers one "Read this when …", given as `read-when` in its front matter, within
`pageWordBudget` words. It lives directly in `wiki/` or in one of the sections `wikiSections`
names; the index lists each section with what its pages are for.

A page links to the symbol, test or config entry that holds a fact rather than restating it.
`wiki/index/` is generated from the pages and every `project.json`: never edit it, never copy it.

## How it stays true

The gate judges the documentation as it judges code: links and backticked paths resolve
(`links.resolve`, `docs.paths`), commands and scripts exist (`docs.commands`), backticked
symbols are spelled as the code spells them (`docs.symbols`), each page has a section, a
`read-when` and a budget (`index.section`, `index.read-when`, `docs.words`), and the index is
current (`index.current`). What no check can judge is the change's: a change that makes a line
untrue rewrites or deletes it in the same commit, as
[documenting a change](../how-to/document-a-change.md) says.
