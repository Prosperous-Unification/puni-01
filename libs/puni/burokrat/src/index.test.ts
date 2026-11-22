import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { burokratParser } from './index';

describe('burokratParser', () => {
  test('a bare group parses to an empty request', () => {
    expect(parse(burokratParser, [])).toEqual({ success: true, value: {} });
  });

  test('a stray token is refused', () => {
    expect(parse(burokratParser, ['stray']).success).toBe(false);
  });

  test('an unknown flag is refused', () => {
    expect(parse(burokratParser, ['--bogus']).success).toBe(false);
  });
});
