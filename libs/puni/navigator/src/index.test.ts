import { parse } from '@optique/core';
import { describe, expect, test } from 'bun:test';
import { navigatorParser } from './index';

describe('navigatorParser', () => {
  test('a bare group parses to an empty request', () => {
    expect(parse(navigatorParser, [])).toEqual({ success: true, value: {} });
  });

  test('a stray token is refused', () => {
    expect(parse(navigatorParser, ['stray']).success).toBe(false);
  });

  test('an unknown flag is refused', () => {
    expect(parse(navigatorParser, ['--bogus']).success).toBe(false);
  });
});
