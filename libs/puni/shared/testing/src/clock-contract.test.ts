import { describe, expect, test } from 'bun:test';
import { createSystemClock } from '@puni/shared-adapters';
import { fixedInstant, memoryHost } from './memory-host';

describe('the Clock contract', () => {
  test('the system clock reads the current instant', () => {
    const before = Date.now();
    const now = createSystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  test('the memory clock always reads its fixed instant, and a copy of it', () => {
    const clock = memoryHost({}).services.clock();
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now()).toEqual(new Date('2031-04-05T23:30:00Z'));
    expect(fixedInstant).toEqual(new Date('2031-04-05T23:30:00Z'));
    const told = new Date('2032-01-02T03:04:05Z');
    expect(memoryHost({}, { now: told }).services.clock().now()).toEqual(told);
  });
});
