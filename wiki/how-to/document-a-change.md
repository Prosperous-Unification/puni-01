---
title: Documenting a change
read-when: finishing a change that adds, renames or removes something an agent would need to know
---

# Documenting a change

Documentation changes in the same commit as the code it describes; [documentation](../concepts/documentation.md)
says where each kind of fact lives. Before committing:

1. **Find what the change made untrue.** Search the documentation and JSDoc for every name, path,
   command and behaviour the change renamed, moved or removed: `git grep -n <old name>`. The gate
   catches a stale typed reference, inline link, path or command; it cannot catch prose, so the search does.
   Rewrite each untrue line to say what is true now, or delete it. Never mark it old.
2. **Place each new fact in its first home.** Can a check or test hold it? Write that. A type or
   a name? Use it. Does one library own it? JSDoc on the symbol. Only what spans libraries and
   no code can hold goes on a page.
3. **Keep the library's own lines true.** When a library's job changes, rewrite `metadata.readWhen` in
   its `project.json` as the task that should open it, and point `metadata.readFirst` at the file that shows
   the whole library. A new export carries JSDoc saying what it is and every outcome it has.
4. **Change pages by their "Read when".** A fact that fits an existing page's `read-when` goes
   there. One that answers a new question gets a new page in the section its content is, with
   `title` and `read-when` front matter; the map lists it, so no other page needs to. A page
   past its budget splits along its questions, or sheds what one library owns into that
   library's JSDoc. A page with nothing left that only it holds is deleted.
5. **Keep out what does not bind.** Why an option was rejected, what was measured, what is
   planned: those are records in the records repository, filed as its `AGENTS.md` says. The
   repository keeps only the reason that still binds, beside the fact it explains.
6. **Run `bun run fix`, then `bun run gate`.** The fix formats; the gate judges links, paths,
   commands, typed references, sections, the map and budgets. A new partition needs a purpose
   in the `map` of `puni.json`; `bun run puni burokrat wiki map` shows what an agent will see.
