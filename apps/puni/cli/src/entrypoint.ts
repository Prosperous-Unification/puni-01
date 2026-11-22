#!/usr/bin/env bun
import { runCommand } from './cli';
import { readInvocation, UsageRefusal } from './cli-parser';

/** Optique hands over help pages with their final newline but the version without one. */
function writeLine(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

try {
  const invocation = readInvocation(process.argv.slice(2), writeLine);
  if (invocation.kind === 'command') process.exitCode = runCommand(invocation.command, writeLine);
} catch (failure) {
  if (!(failure instanceof UsageRefusal)) throw failure;
  process.stderr.write(`error: ${failure.message}\n`);
  // Proof: exiting 1 here made `nope refuses with exit 2 and one error line` fail (2026-11-22).
  process.exitCode = 2;
}
