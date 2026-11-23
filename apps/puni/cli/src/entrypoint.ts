#!/usr/bin/env bun
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { unexpectedFailureExitCode } from '@puni/shared-command';
import { describeCause, reportFailure } from '@puni/shared-failures';

/** What the command line selected, recorded in a report instead of the arguments. */
let selected = 'unparsed';

/**
 * Writes `text` as the report `<reference>.json` in this user's report directory,
 * `<os tmpdir>/puni-failures-<uid>`, created with mode 0700; the file is created new with mode
 * 0600. Returns the file's path, or why the report was lost: a directory that cannot be made, or
 * that is not a directory this user alone owns and opens, or a file that cannot be written.
 */
function writeReport(reference: string, text: string): { path: string } | { lost: string } {
  const { uid } = userInfo();
  const directory = join(tmpdir(), `puni-failures-${String(uid)}`);
  const path = join(directory, `${reference}.json`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const described = lstatSync(directory);
    if (!described.isDirectory() || described.uid !== uid || (described.mode & 0o077) !== 0) {
      return { lost: `${directory} is not a directory only this user can open` };
    }
    writeFileSync(path, text, { mode: 0o600, flag: 'wx' });
  } catch (cause) {
    return { lost: describeCause(cause) };
  }
  return { path };
}

/**
 * What the reporter is handed for `caught`. Reports inspect without running getters, so an
 * `Error` whose `message` or `stack` is not its own plain value (Bun's `ResolveMessage` and
 * `BuildMessage` read both through prototype getters) would be reported as `[not-inspected]`:
 * such an error is read here, once, into a plain `Error` carrying its name, message and stack,
 * with the original as its `cause`. Any other value, and an error whose fields are plain, is
 * handed over as it is, keeping an application exception's occurrence id; so is an error whose
 * getter throws.
 */
function readReportable(caught: unknown): unknown {
  if (!(caught instanceof Error)) return caught;
  const plain = (key: 'message' | 'stack'): boolean => {
    const field = Object.getOwnPropertyDescriptor(caught, key);
    return field !== undefined && 'value' in field;
  };
  if (plain('message') && plain('stack')) return caught;
  try {
    const snapshot = new Error(caught.message, { cause: caught });
    snapshot.name = caught.name;
    snapshot.stack = caught.stack ?? `${caught.name}: ${caught.message}`;
    return snapshot;
  } catch {
    // A getter that throws leaves the error as it is: the report still names its constructor.
    return caught;
  }
}

/**
 * The one catch-all of `puni`, around loading and running `main.ts` and for any failure outside
 * that path (an unhandled rejection or an uncaught exception): it is reported and the exit code
 * is 3. An error is reported with its name, message and stack ({@link readReportable}),
 * through the same redaction as everything else. The report records what the command line selected, never its arguments. The diagnostic
 * report goes to `<os tmpdir>/puni-failures-<uid>/<occurrence id>.json`, or inline on stderr
 * when `PUNI_FAILURE_REPORT=stderr`; stderr always ends with one
 * `error: unexpected failure, reference <id>, report <where>` line. A report that cannot be made
 * or written says `report lost: <reason>` instead.
 */
function exitOnUnexpectedFailure(caught: unknown): void {
  process.exitCode = unexpectedFailureExitCode;
  const reporting = reportFailure(readReportable(caught), { command: selected });
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
  const written = writeReport(reference, text);
  line(reference, 'path' in written ? written.path : `lost: ${written.lost}`);
}

process.on('unhandledRejection', exitOnUnexpectedFailure);
process.on('uncaughtException', exitOnUnexpectedFailure);

try {
  const { runProcess } = await import('./main');
  await runProcess((selection) => {
    selected = selection;
  });
} catch (caught) {
  exitOnUnexpectedFailure(caught);
}
