import type { Clock } from '@puni/shared-ports';

/** The {@link Clock} of this machine. */
export function createSystemClock(): Clock {
  return { now: () => new Date() };
}
