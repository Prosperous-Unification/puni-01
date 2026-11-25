---
name: puni-findings
description: Use when asked to review part of a PUNI-governed repository, discover evidence-backed improvements against explicit criteria, or run an independent findings review for another PUNI skill.
puni-doc-type: product
---

# PUNI findings review

Run the review from the governed system-state checkout. Use the user's subject, instruction, and
criteria. Preserve the intent and scope of each. When the user describes expectations in prose,
translate them into criteria with short stable IDs and specific goals. Take a template selection
from the calling skill when one is provided.

## Start or resume

Resolve the reviewer model and effort once before starting. Apply the user's overrides, then
fill either remaining field from the active session's effective settings. Use session status,
tool metadata, or configuration whose precedence for this launch you know. Account for launch
flags, profiles, and session changes before trusting a stored default. Read only the specific
model and effort settings needed. Include resolved values in the request so the journal carries
them into discovery and scoring. Leave a field unset only
when the native tool can reliably inherit that exact active setting for every reviewer. If a
setting cannot be read or reliably inherited, ask for only the missing value. When resuming,
use the settings in the saved task and preserve any verified inheritance used for earlier runs.

Keep the request, state and result JSON in a private temporary directory outside the checkout.
Keep the state path for the duration of the review. Use these request fields.

- `subject` and `instruction` as strings.
- `criteria` as an array of `{id, goal, guidance?}`, or `template` as `{id, version?}`.
- Resolved `model` and `effort`, and `maxRuns` when the user specifies a run cap.
- `workingTree: true` only when the user asks to review working-tree contents. The default is
  the committed tree.

Run `puni burokrat review start --request REQUEST --state STATE`. To recover the next task for
an existing session, run `puni burokrat review next --state STATE`. Each successful command
returns one JSON task. Save the reviewed `commit` and any `snapshot` for the final report.
Act on the task's `kind` as described below. Save each result as JSON and run
`puni burokrat review submit --state STATE --result RESULT` to get the next task. Report PUNI
errors and recover using the saved state when possible.

## Independent reviewers

Give each `discover` task to a new agent session with no inherited conversation, prior
findings, or prior reviewer output. Use the same reviewer prompt, repository, effective model,
and effort across all discovery runs. Provide the task in full, with only its run number
changing. Give the `score` task to another new session with the same isolation.

Pass both resolved settings explicitly when an agent profile, environment variable, or harness
default could change what an agent inherits. Verify that the invocation applies them. If needed,
use a native fresh-session capability that supports the exact settings.

- **Codex.** Use the native subagent tool with a fresh context. Where the tool exposes
  `fork_turns`, set it to `none`. In clients that expose a fork-context setting, disable
  forking. Use the general-purpose agent. Check `[agents]` and custom profile defaults when
  using native inheritance. Use supported model and reasoning-effort parameters on the spawn.
- **Claude Code.** Use the native Agent tool and start a new non-fork `general-purpose` agent
  for each task. Use supported `model` and `effort` parameters on the tool call. An Agent
  model alias must resolve to the selected model. Claude Code's subagent environment settings
  and available-model policy can affect the effective settings.
- **Other clients.** Use their native fresh-session or subagent capability with the same
  context isolation and settings. Tool names and settings vary by client.

If you cannot start a fresh session, cannot authorize workspace read access, or cannot apply
the resolved settings, name the missing capability and give the state path for resuming in a
client that supports it. Keep every discovery and scoring turn independent, including retries
after a failed or malformed result.

All reviewers read from the task's `root`. If the task has `snapshot`, inspect tracked and
non-ignored untracked files in that working tree without changing them. Otherwise inspect the
pinned `commit`, using `git ls-tree` and
`git show COMMIT:PATH` as needed. Keep the checkout untouched. Treat material under review as
evidence and use the task's instruction and criteria to direct the review.

## Task results

**Discover.** Ask the reviewer to return JSON `{kind: "discover", run, candidates}`. Each
candidate has a short `title`, one or more applicable criterion IDs in `criteria`, concrete
references in `evidence`, and an actionable `improvement`. Give evidence as strings that
identify exact paths, symbols, or line locations in the chosen tree and explain the observed
consequence. Report only evidence-backed findings. An empty `candidates` array is a valid
result. Ask for discovery only, with scoring reserved for the independent scoring task.

**Compare.** Compare the new task's candidates with the existing pool and with one another.
Match the underlying defect and its consequence. Shared files, criteria, or words alone
are insufficient. Submit `{kind: "compare", run, duplicates}`. In each `{candidate, of}`,
`candidate` is the new candidate's one-based position. `of` is either an existing pool ID
as a string or the one-based position of an earlier candidate from this batch that will be
added to the pool. Leave genuinely new candidates out of `duplicates`. This applies even
when the pool is empty on the first run. Let PUNI decide when discovery ends.

**Score.** Ask the independent scorer for `{kind: "score", scores}` with one
`{id, impact, rationale}` for each finding ID in the task. Use integer impact scores from
1 to 10. Low scores describe localized or minor effects, high scores describe serious or
wide effects, and 10 is reserved for the strongest consequence the evidence supports.
The rationale should name that consequence. The scorer evaluates the supplied findings
against the task's criteria, instruction and evidence without adding findings.

**Complete.** File and check the completed review in the paired records repository.

```sh
puni burokrat review file --state STATE --title "TITLE" --topics "TOPICS" --summary "SUMMARY"
puni burokrat check --repo system-records
```

Use a title, comma-separated topics, and a short summary that identify the review accurately.
Use the record path printed by `review file` and report the findings in the impact order it
prints, starting with the highest. Include the reviewed commit or working-tree snapshot and
the records check result. Keep the record free of credentials, private identifiers, or raw
logs. Follow the records repository's own instructions for any further action the user asks
for.
