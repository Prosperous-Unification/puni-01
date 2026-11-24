import { describe, expect, mock, test } from 'bun:test';
import * as appex from 'application-exception';
import { decodePublicReport, defineException } from 'application-exception';
import { findDefect, remedyDefect } from './defect';
import { failureReportMaxBytes, reportFailure } from './report-failure';

const Broken = defineException({
  tag: 'puni/test/Broken',
  message: ({ path }: { rule: 'test.rule'; path: string }) => `${path} is broken`,
});
const Other = defineException({ tag: 'puni/test/Other', message: 'other' });

/** Secret-shaped samples, built when the tests run so that no file holds one. */
const sample = {
  skToken: ['sk', 'live', 'Zq3'.repeat(6)].join('-'),
  passwordKey: ['pass', 'word'].join(''),
  password: 'hunter2'.repeat(2),
  tokenKey: ['tok', 'en'].join(''),
  contextToken: 'Kp7'.repeat(6),
  githubToken: `${['gh', 'p_'].join('')}${'a1B2'.repeat(9)}`,
  ageKey: `${['AGE', 'SECRET', 'KEY'].join('-')}-1${'QZ7'.repeat(19)}X`,
  wbsKey: `${['wbs', 'mk'].join('_')}_1234abcd-12ab-34cd-56ef-1234567890ab.${'aB3_-'.repeat(8)}abc`,
};

describe('findDefect', () => {
  const remedies = [remedyDefect(Broken, ({ path }) => `mend ${path}`)];

  test('an occurrence of a listed kind is its finding, with the remedy of its kind', () => {
    const defect = new Broken({ details: { rule: 'test.rule', path: 'a.md' } });
    expect(findDefect(defect, remedies)).toEqual({
      rule: 'test.rule',
      path: 'a.md',
      message: 'a.md is broken',
      remedy: 'mend a.md',
    });
  });

  test('anything else is no finding', () => {
    expect(findDefect(new Other(), remedies)).toBeUndefined();
    expect(findDefect(new Error('x'), remedies)).toBeUndefined();
    expect(findDefect('a string', remedies)).toBeUndefined();
  });
});

describe('reportFailure', () => {
  test('correlates both reports under the occurrence id, disclosing nothing in public', () => {
    const failure = new Broken({ details: { rule: 'test.rule', path: 'a.md' } });
    const reporting = reportFailure(failure, { argv: 'burokrat check' });
    if (!reporting.reported) throw new Error(reporting.reason);
    const { occurrence_id: reference, diagnostic, public: disclosed } = reporting.reports;
    expect(reference).toBe(failure.occurrenceId);
    expect(diagnostic.occurrence_id).toBe(reference);
    expect(diagnostic.context).toEqual({ argv: 'burokrat check' });
    const decoded = decodePublicReport(disclosed);
    expect(decoded).toMatchObject({ ok: true, report: { code: 'INTERNAL_ERROR' } });
  });

  test('redacts sensitive keys and never runs a getter of the caught value', () => {
    let getterRan = false;
    const hostile = {
      token: 'sk-live-secret',
      get message(): string {
        getterRan = true;
        return 'ran';
      },
    };
    const reporting = reportFailure(hostile);
    if (!reporting.reported) throw new Error(reporting.reason);
    expect(JSON.stringify(reporting.reports.diagnostic)).not.toContain('sk-live-secret');
    expect(getterRan).toBe(false);
  });

  const leaks: readonly (readonly [string, () => unknown, string, Record<string, string>])[] = [
    [
      'a token in an error message',
      () => new Error(`refused key ${sample.skToken}`),
      sample.skToken,
      {},
    ],
    [
      'a password assignment in a property',
      () => ({ note: `${sample.passwordKey}=${sample.password}` }),
      sample.password,
      {},
    ],
    [
      'a token assignment in the context',
      () => new Error('x'),
      sample.contextToken,
      { note: `${sample.tokenKey}: ${sample.contextToken}` },
    ],
    [
      'an age secret key in an error message',
      () => new Error(`cannot decrypt with ${sample.ageKey}`),
      sample.ageKey,
      {},
    ],
    [
      'a WBS API key in a property',
      () => ({ header: `X-Api ${sample.wbsKey}` }),
      sample.wbsKey,
      {},
    ],
    [
      'a GitHub token in a cause',
      () => new Error('outer', { cause: sample.githubToken }),
      sample.githubToken,
      {},
    ],
  ];

  test.each(leaks)('leaves %s out of both reports', (_name, makeCaught, secret, context) => {
    const reporting = reportFailure(makeCaught(), context);
    if (!reporting.reported) throw new Error(reporting.reason);
    expect(JSON.stringify(reporting.reports.diagnostic)).not.toContain(secret);
    expect(JSON.stringify(reporting.reports.public)).not.toContain(secret);
  });

  test('bounds the diagnostic report', () => {
    const reporting = reportFailure(new Error('x'.repeat(failureReportMaxBytes * 2)));
    if (!reporting.reported) throw new Error(reporting.reason);
    expect(JSON.stringify(reporting.reports.diagnostic).length).toBeLessThanOrEqual(
      failureReportMaxBytes,
    );
  });

  test('a failure while reporting is a lost report naming the occurrence', () => {
    const failure = new Broken({ details: { rule: 'test.rule', path: 'a.md' } });
    void mock.module('application-exception', () => ({
      ...appex,
      makeReportPair: () => {
        throw new Error('the reporter broke');
      },
    }));
    try {
      expect(reportFailure(failure)).toEqual({
        reported: false,
        occurrenceId: failure.occurrenceId,
        reason: 'the reporter broke',
      });
      expect(reportFailure('a string')).toMatchObject({ occurrenceId: 'UNREPORTED' });
    } finally {
      void mock.module('application-exception', () => appex);
    }
  });
});
