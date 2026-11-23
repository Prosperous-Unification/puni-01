import type { UsagePeriod } from './contract';
import { PeriodRefused } from './failures';

/**
 * The spelling of an instant on the command line: a UTC date and time to the second, with up to
 * nine digits of fraction, such as `2026-11-22T00:00:00Z`.
 */
export const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

/** The instant `spelled` names, as milliseconds since the epoch; `NaN` when it names none. */
export function readInstant(spelled: string): number {
  return Date.parse(spelled);
}

/**
 * The period from `since` to `until`, both normalised to ISO instants.
 *
 * @throws PeriodRefused when either is no instant of {@link instantPattern}, a date the calendar
 *   lacks included, or `until` is not after `since`.
 */
export function readPeriod(since: string, until: string): UsagePeriod {
  const bounds = [since, until].map((spelled) => {
    const instant = readInstant(spelled);
    // A runtime may read 2026-02-30 as March 2: the instant must spell its own seconds.
    const isCalendar =
      !Number.isNaN(instant) &&
      new Date(instant).toISOString().slice(0, 19) === spelled.slice(0, 19);
    if (!instantPattern.test(spelled) || !isCalendar) {
      throw new PeriodRefused({ details: { problem: `${spelled} is no UTC instant` } });
    }
    return new Date(instant);
  });
  const [start, end] = bounds;
  if (start === undefined || end === undefined || end <= start) {
    throw new PeriodRefused({ details: { problem: `${until} is not after ${since}` } });
  }
  return { since: start.toISOString(), until: end.toISOString() };
}

/** Whether the instant `instant`, in milliseconds, falls in `period`. */
export function isInPeriod(instant: number, period: UsagePeriod): boolean {
  return instant >= readInstant(period.since) && instant < readInstant(period.until);
}
