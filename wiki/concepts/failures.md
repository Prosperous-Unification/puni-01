---
title: Failures
read-when: deciding how code reports something going wrong, or which exit code a command returns
---

# Failures

Every failure is one of three, and each reaches the user differently.

- **A modelled failure** is a `defineException` kind in its library's `failures.ts`, tagged
  `puni/<alias>/<Kind>` after the library's `@puni/<alias>`, as `puni/shared-command/UsageRefused`
  is. The command that expects it prints one `error:` line on stderr and returns its exit code.
- **A repository defect** is a modelled failure of the repository's own inputs, carrying `rule`
  and `path`. Its remedy is written once beside the kind with [`remedyDefect`](../../libs/puni/shared/failures/src/defect.ts#remedyDefect), and a feature turns
  it into a finding or outcome with [`findDefect`](../../libs/puni/shared/failures/src/defect.ts#findDefect); both are in
  [defect.ts](../../libs/puni/shared/failures/src/defect.ts).
- **Anything else** propagates, uncaught, to `exitOnUnexpectedFailure` in
  [entrypoint.ts](../../apps/puni/cli/src/entrypoint.ts), the one catch-all: it reports the
  failure with a reference and sets exit code 3. Nothing calls `process.exit`.

[`CommandExitCode`](../../libs/puni/shared/command/src/command.ts#CommandExitCode) in [command.ts](../../libs/puni/shared/command/src/command.ts) says what each
exit code means.
