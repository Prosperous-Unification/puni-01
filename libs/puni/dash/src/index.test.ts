import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { dashParser } from './index';

describe('dashParser', () => {
  test('a bare group parses to an empty request', () => {
    expect(parse(dashParser, [])).toEqual({ success: true, value: {} });
  });

  test('a stray token is refused', () => {
    expect(parse(dashParser, ['stray']).success).toBe(false);
  });

  test('an unknown flag is refused', () => {
    expect(parse(dashParser, ['--bogus']).success).toBe(false);
  });
});
