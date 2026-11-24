import { describe, expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import {
  formatReviewBody,
  judgeReviewBody,
  parseReviewCandidate,
  parseReviewCriteria,
  parseReviewRecord,
} from './index';

const finding = {
  id: 'f-1',
  title: 'The initial state is missing',
  criteria: ['reliability'],
  evidence: ['The first line\nThe second line'],
  improvement: 'Start with a named state.',
  impact: 8,
  rationale: 'The reader cannot reproduce the outcome.',
};

const review = {
  subject: 'Review the example',
  instruction: 'Use the supplied criteria.',
  criteria: [{ id: 'reliability', goal: 'Reproduce the outcome.' }],
  runs: [1, 0],
  maxRuns: 3,
  stop: 'no-new-findings',
  findings: [finding],
} as const;

describe('review record', () => {
  test('parses criteria and a candidate before it has a score', () => {
    const criteria = parseReviewCriteria(review.criteria);
    const candidate = {
      title: finding.title,
      criteria: finding.criteria,
      evidence: finding.evidence,
      improvement: finding.improvement,
    };
    expect(parseReviewCandidate(candidate, criteria)).toEqual(candidate);
    throws(
      () => parseReviewCandidate({ ...candidate, criteria: ['unknown'] }, criteria),
      /criteria/u,
    );
    throws(() => parseReviewCriteria([]), /criteria/u);
  });

  test('preserves the finding and the review inputs in Markdown', () => {
    const input = {
      ...review,
      model: 'reviewer',
      effort: 'high',
      snapshot: 'a'.repeat(64),
      template: { id: 'design-review', version: '1' },
      criteria: [
        { id: 'reliability', goal: 'Reproduce the outcome.', guidance: 'Check the input.' },
      ],
    };
    const body = formatReviewBody(parseReviewRecord(input));
    expect(body).toContain('## Criteria\n\n### reliability\n- Goal: Reproduce the outcome.');
    expect(body).toContain('- Guidance: Check the input.');
    expect(body).toContain('- Model: reviewer');
    expect(body).toContain('- Effort: high');
    expect(body).toContain(`- Snapshot: ${'a'.repeat(64)}`);
    expect(body).toContain('- Template: design-review\n- Template version: 1');
    expect(body).toContain('## Runs\n- New findings per run: 1, 0');
    expect(body).toContain('## Findings\n\n### f-1');
    expect(body).toContain('- Impact: 8\n- Rationale: The reader cannot reproduce the outcome.');
    expect(body).toContain('- Evidence: The first line\\nThe second line');
    expect(judgeReviewBody('assessment-review', body)).toBeUndefined();
    expect(judgeReviewBody('finding', body)).toContain('template');
  });

  test('accepts an empty review only when a run produced zero new findings', () => {
    const empty = formatReviewBody({ ...review, runs: [0, 0], findings: [] });
    expect(empty).toContain('## Findings\n\nNo findings.');
    expect(judgeReviewBody('finding', empty)).toBeUndefined();
    expect(judgeReviewBody('assessment-review', empty)).toContain('template');
    expect(judgeReviewBody('finding', empty.replace('No findings.', ''))).toContain('Findings');
    throws(() => parseReviewRecord({ ...review, runs: [], findings: [] }), /runs/u);
    throws(() => parseReviewRecord({ ...review, runs: [1], findings: [] }), /runs/u);
  });

  test.each([
    [{ findings: [{ ...finding, impact: 0 }] }, /impact/u],
    [{ findings: [{ ...finding, impact: 11 }] }, /impact/u],
    [{ findings: [{ ...finding, impact: 8.5 }] }, /impact/u],
    [{ findings: [{ ...finding, rationale: '' }] }, /rationale/u],
    [{ findings: [{ ...finding, evidence: [] }] }, /evidence/u],
    [{ findings: [{ ...finding, improvement: '' }] }, /improvement/u],
    [{ findings: [{ ...finding, criteria: ['unknown'] }] }, /criteria/u],
    [{ criteria: [review.criteria[0], review.criteria[0]] }, /criteria/u],
    [{ findings: [finding, finding], runs: [2, 0] }, /id/u],
    [
      {
        findings: [
          { ...finding, impact: 7 },
          { ...finding, id: 'f-2' },
        ],
        runs: [2, 0],
      },
      /impact/u,
    ],
    [{ runs: [2, 0] }, /runs/u],
    [{ runs: [1, 0, 0] }, /runs/u],
    [{ runs: [1], stop: 'no-new-findings' }, /no-new-findings/u],
    [{ runs: [1], stop: 'run-limit' }, /run-limit/u],
    [{ runs: [1, 0], maxRuns: 2, stop: 'run-limit' }, /run-limit/u],
    [{ maxRuns: 1 }, /maxRuns/u],
    [{ template: { id: 'invalid id', version: '1' } }, /template.id/u],
    [{ template: { id: 'design-review', version: '0' } }, /template.version/u],
    [{ snapshot: 'some hash' }, /snapshot/u],
  ])('rejects an inconsistent review (%o)', (changes, problem) => {
    throws(() => parseReviewRecord({ ...review, ...changes }), problem);
  });

  test('accepts an empty first run followed by a finding at the run limit', () => {
    const body = formatReviewBody({ ...review, runs: [0, 1], maxRuns: 2, stop: 'run-limit' });
    expect(judgeReviewBody('finding', body)).toBeUndefined();
  });

  test('checks the Markdown structure independently of the review values', () => {
    const body = formatReviewBody(review);
    expect(judgeReviewBody('finding', body.replace('## Runs', '## Iterations'))).toContain('Runs');
    expect(judgeReviewBody('finding', body.replace('- Impact: 8\n', ''))).toContain('Impact');
    expect(judgeReviewBody('finding', body.replace('- Impact: 8', '- Impact: 17'))).toContain(
      'impact',
    );
    expect(judgeReviewBody('assessment', 'Free-form run output.')).toBeUndefined();
  });
});
