#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unexpectedFailureExitCode } from '@puni/shared-command';
import { reportFailure } from '@puni/shared-failures';

/**
 * The one catch-all of `puni`, around loading and running `main.ts`: anything that escapes is
 * reported and the exit code is 3. The diagnostic report goes to
 * `<os tmpdir>/puni-failures/<occurrence id>.json`, or inline on stderr when
 * `PUNI_FAILURE_REPORT=stderr`; stderr always ends with one
 * `error: unexpected failure, reference <id>, report <where>` line. A report that cannot be made
 * or written says `report lost: <reason>` instead.
 */
function exitOnUnexpectedFailure(caught: unknown): void {
  process.exitCode = unexpectedFailureExitCode;
  const reporting = reportFailure(caught, { argv: process.argv.slice(2).join(' ') });
  const line = (reference: string, where: string): void => {
    process.stderr.write(`error: unexpected failure, reference ${reference}, report ${where}\n`);
  };
  if (!reporting.reported) {
    line(reporting.occurrenceId, `lost: ${reporting.reason}`);
    return;
  }
  const { occurrence_id: reference, diagnostic } = reporting.reports;
  const text = `${JSON.stringify(diagnostic)}\n`;
  if (process.env['PUNI_FAILURE_REPORT'] === 'stderr') {
    process.stderr.write(text);
    line(reference, 'above');
    return;
  }
  const directory = join(tmpdir(), 'puni-failures');
  const path = join(directory, `${reference}.json`);
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, text);
  } catch (cause) {
    line(reference, `lost: ${cause instanceof Error ? cause.message : String(cause)}`);
    return;
  }
  line(reference, path);
}

try {
  const { runProcess } = await import('./main');
  await runProcess();
} catch (caught) {
  exitOnUnexpectedFailure(caught);
}
