import {
  makeReportPair,
  type PublicReportCorjOptions,
  type ReportPair,
} from 'application-exception';
import type { CorjInspection } from 'caught-object-report-json';
import { createFailureRedaction } from './redaction';

const inspection: CorjInspection = 'no-invoke';

/**
 * How far a failure report walks: four levels of causes, sixteen children, and no getter or
 * method of the caught value is run.
 */
export const failureReportLimits = {
  maxDepth: 4,
  maxChildren: 16,
  inspection,
} as const satisfies PublicReportCorjOptions;

/** The most bytes a diagnostic report may hold. */
export const failureReportMaxBytes = 16_384;

/**
 * The reports of one unexpected failure, or why they were lost: losing a report is a modelled
 * outcome with its own reference, never silent.
 */
export type FailureReporting =
  | { readonly reported: true; readonly reports: ReportPair }
  | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

function readOccurrenceId(caught: unknown): string {
  if (typeof caught !== 'object' || caught === null || !('occurrenceId' in caught)) {
    return 'UNREPORTED';
  }
  return typeof caught.occurrenceId === 'string' ? caught.occurrenceId : 'UNREPORTED';
}

/**
 * The correlated diagnostic and public reports of `caught`, bounded by
 * {@link failureReportLimits} and {@link failureReportMaxBytes} and redacted. Never throws: a
 * failure while reporting is `{ reported: false }` naming the occurrence it lost, or
 * `UNREPORTED` when `caught` carries none.
 */
export function reportFailure(
  caught: unknown,
  context: Readonly<Record<string, string>> = {},
): FailureReporting {
  try {
    const redact = createFailureRedaction();
    const reports = makeReportPair(caught, {
      diagnostic: {
        redact,
        corj: failureReportLimits,
        maxReportBytes: failureReportMaxBytes,
        context,
      },
      public: { redact, corj: failureReportLimits },
    });
    return { reported: true, reports };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { reported: false, occurrenceId: readOccurrenceId(caught), reason };
  }
}
