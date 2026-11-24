---
name: puni-assessment
description: Use when asked to assess a PUNI-governed repository against a named rubric or template, or to choose a suitable rubric for a repository assessment.
---

# PUNI template assessment

Run `puni burokrat assess templates --json` from the governed system-state checkout. Use the
catalog to select the template and version requested by the user. If they describe the
assessment without naming its rubric, choose the catalog entry that matches their scope.
Ask for clarification when the choice would materially change what is assessed and the
request leaves it unresolved.

Activate the installed `puni-findings` skill. In its review request use the selected
`template: {id, version}`, the user's subject and instruction, and any requested run cap or
working-tree override. Resolve reviewer model and effort as `puni-findings` directs, applying
any user overrides. Keep the template's criteria intact. PUNI resolves the selected version
into criteria that each reviewer receives.

Carry the findings review through completion, record filing and the records check. In the
assessment report identify the template and version, the reviewed snapshot, the saved
record, the records check result and the findings in the score order PUNI prints.
