import { defineException } from 'application-exception';

/** A period the command line gave that is no period: a refused command line. */
export const PeriodRefused = defineException({
  tag: 'puni/burokrat-assess/PeriodRefused',
  message: ({ problem }: { problem: string }) => `the period is refused: ${problem}`,
});

/** A harness log directory or file that cannot be read. */
export const HarnessLogUnreadable = defineException({
  tag: 'puni/burokrat-assess/HarnessLogUnreadable',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `the harness log ${path} cannot be read: ${reason}`,
});

/** A JSON line of a harness log that lacks what usage is read from, or contradicts another. */
export const HarnessLogMalformed = defineException({
  tag: 'puni/burokrat-assess/HarnessLogMalformed',
  message: ({ path, line, problem }: { path: string; line: number; problem: string }) =>
    `the harness log ${path}:${String(line)} ${problem}`,
});

/** A rate card file that cannot be read. */
export const RateCardUnreadable = defineException({
  tag: 'puni/burokrat-assess/RateCardUnreadable',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `the rate card ${path} cannot be read: ${reason}`,
});

/** A rate card that is not JSON, or not a rate card. */
export const RateCardMalformed = defineException({
  tag: 'puni/burokrat-assess/RateCardMalformed',
  message: ({ source, problem }: { source: string; problem: string }) =>
    `the rate card ${source} ${problem}`,
});

/** Git cannot list the merges of the system-state repository. */
export const OutcomesUnreadable = defineException({
  tag: 'puni/burokrat-assess/OutcomesUnreadable',
  message: ({ root, reason }: { root: string; reason: string }) =>
    `the merges into main of ${root} cannot be listed: ${reason}`,
});
