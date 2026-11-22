#!/usr/bin/env bun
import { runCommand } from './cli';
import { readInvocation, UsageRefusal } from './cli-parser';

/** Optique hands over help pages with their final newline but the version without one. */
function writeLine(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

try {
  const invocation = readInvocation(process.argv.slice(2), writeLine);
  if (invocation.kind === 'command')
    process.exitCode = runCommand(invocation.command, {
      cwd: process.cwd(),
      stdout: writeLine,
      stderr: (text) => process.stderr.write(text),
    });
} catch (failure) {
  if (!(failure instanceof UsageRefusal)) throw failure;
  process.stderr.write(`error: ${failure.message}\n`);
  process.exitCode = 2;
}
