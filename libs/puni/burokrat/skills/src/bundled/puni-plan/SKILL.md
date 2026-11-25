---
name: puni-plan
description: Use when asked to plan work in a PUNI-governed repository, to stress-test or grill a goal or draft plan before work starts, or to replace a filed plan whose goal, scope or evidence changed.
puni-doc-type: product
---

# PUNI plan

Run from the governed system-state checkout. The outcome is one plan record in the paired
records repository, filed by `puni navigator plan add` after the owner accepts the draft. When
asked only to stress-test a goal or draft, the outcome is a report and nothing is filed.

## Inspect first

Read `AGENTS.md`, the map that `puni burokrat wiki map` prints, the code and pages the goal
touches, and every record or other artifact the task names. Open only the records the task
names. Answer from the repository whatever the repository can answer.

Sort what you learn into three kinds and keep them apart through the whole plan.

- **Fact.** Something a file, command or record shows. Keep its path or command.
- **Owner choice.** Something only the owner can decide.
- **Assumption.** Something you decided for the owner because it is cheap to reverse.

## Interview

Ask the owner only about choices that change the goal, the scope, the evidence of completion,
the risk or who owns the work. Ask one question at a time when an answer changes the questions
that follow. With each question give the answer you recommend and what the alternative costs.
Decide reversible implementation details yourself and record each as an assumption.

The interview ends when every such choice is decided, or is recorded as an assumption with its
consequence if wrong and the event that reopens it.

To stress-test an existing goal or draft, run this section against it. Report each
contradiction with an inspected source, each unstated assumption and each unresolved choice,
with its evidence. Leave the draft and every filed record unchanged. A filed plan changes
only as "Replace a filed plan" describes.

## Draft

Write the body as Markdown in a private temporary file outside both checkouts. Use these
headings in this order.

- `# TITLE`, the title the record is filed under.
- `## Goal`. The outcome wanted and why. Say what is true now and what will be true.
- `## Scope`. What the work delivers, then what it deliberately leaves out.
- `## Decisions`. Each owner choice, with the reason that binds it.
- `## Assumptions`. Each with its consequence if wrong and what reopens it.
- `## Work`. A list of leaves. Each leaf is one outcome that can be verified by itself, with
  the evidence that proves it and the leaves it needs first. A leaf needs another only when it
  cannot be done or verified without it. A preferred order is a note on the leaf.
- `## Open questions`. What is unresolved and who decides it.

A small change that is easy to reverse takes a short plan of `## Goal` and `## Work`. Say in
the goal why the short form fits.

Link to an artifact the task names and keep its text where it lives. Keep credentials,
hostnames, addresses and personal data out of the plan. Progress belongs where the records
repository's own instructions put it; the plan states intent only.

## Check the draft

Before showing the draft, confirm each of these and fix what fails.

- Every item in Scope is delivered by at least one leaf, and every leaf serves the Goal.
- Every leaf names evidence that a command, test or observation can show.
- Every dependency names another leaf, and no chain of dependencies returns to its start.
- Every fact still matches its source, and no assumption contradicts one.
- Every open question names the leaves that wait for it.

Show the owner the draft with its assumptions and open questions. File it when the owner
accepts it. Apply requested changes and check the draft again first.

## File

```sh
puni navigator plan add --title "TITLE" --topics "TOPICS" --summary "SUMMARY" --body-file BODY
puni burokrat check --repo system-records
```

Use one to five comma-separated topics and a one-line summary of at most 30 words saying what
the plan decides. `plan add` prints the record's path relative to the records repository. On a
refusal, correct what the error line names and run it again. Commit and push the record as the
records repository's own instructions say.

File what the inspection found and the plan does not need to repeat with
`puni navigator research add`, which takes the same options. File a decision that is hard to
reverse and had real alternatives with `puni burokrat adr add`.

Report the record path, the result of the records check, the assumptions you made and the open
questions. Report PUNI errors as printed.

## Replace a filed plan

A filed plan is replaced by a new plan that supersedes it. Read the plan the task names. List
the decisions, assumptions and leaves the new evidence or constraint touches, then every leaf
that depends on them. Interview the owner about any change to the goal, the scope or the
evidence of completion. Draft the whole new plan so that it reads without the old one, and
check it as above.

```sh
puni navigator plan add --title "TITLE" --topics "TOPICS" --summary "SUMMARY" --body-file BODY --supersedes OLD
puni burokrat check --repo system-records
```

`OLD` is the old plan's path relative to the records repository, as `plan add` printed it. The
command files the new plan naming the old one and marks the old one as superseded by it. Let
the command make both edits. A plan filed on the same day as the old one needs a different
title. Commit the two files together.
