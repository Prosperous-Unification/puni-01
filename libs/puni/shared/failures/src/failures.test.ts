import { describe, expect, mock, test } from 'bun:test';
import * as appex from 'application-exception';
import { decodePublicReport, defineException } from 'application-exception';
import { findDefect } from './defect';
import { failureReportMaxBytes, reportFailure } from './report-failure';

const Broken = defineException({
  tag: 'puni/test/Broken',
  message: ({ path }: { rule: 'test.rule'; path: string }) => `${path} is broken`,
});
const Other = defineException({ tag: 'puni/test/Other', message: 'other' });

describe('findDefect', () => {
  test('an occurrence of a listed kind is its finding', () => {
    const defect = new Broken({ details: { rule: 'test.rule', path: 'a.md' } });
    expect(findDefect(defect, [Broken])).toEqual({
      rule: 'test.rule',
      path: 'a.md',
      message: 'a.md is broken',
    });
  });

  test('anything else is no finding', () => {
    expect(findDefect(new Other(), [Broken])).toBeUndefined();
    expect(findDefect(new Error('x'), [Broken])).toBeUndefined();
    expect(findDefect('a string', [Broken])).toBeUndefined();
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
