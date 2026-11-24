import { expect, test } from 'bun:test';
import { throws } from 'node:assert/strict';
import type { ReviewInput } from './contract';
import { advanceReview, openReview } from './review-progress';

const input: ReviewInput = {
  root: '/review',
  commit: 'f'.repeat(40),
  subject: 'Service diagnostics',
  instruction: 'Inspect the operator guidance.',
  criteria: [
    { id: 'clarity', goal: 'Explain who can take the next step.' },
    { id: 'coverage', goal: 'Document common failure paths.' },
  ],
  maxRuns: 2,
};

const finding = {
  title: 'Explain timeout recovery',
  criteria: ['clarity'],
  evidence: ['manual.md:1'],
  improvement: 'Give the user a recovery step.',
};

test('a duplicate of an earlier candidate extends its evidence and criteria under one ID', () => {
  const { progress, pool } = advanceReview(input, openReview(input), [], {
    kind: 'discover',
    run: 1,
    candidates: [
      finding,
      { ...finding, criteria: ['coverage'], evidence: ['manual.md:1', 'quickstart.md:8'] },
    ],
  });
  const compared = advanceReview(input, progress, pool, {
    kind: 'compare',
    run: 1,
    duplicates: [{ candidate: 2, of: 1 }],
  });
  expect(compared.pool).toEqual([
    {
      ...finding,
      id: 'f-1',
      criteria: ['clarity', 'coverage'],
      evidence: ['manual.md:1', 'quickstart.md:8'],
    },
  ]);
  expect(compared.progress.runs).toEqual([1]);
  const fresh = compared.progress.task;
  expect(fresh).toEqual({ ...input, kind: 'discover', run: 2 });
});

test('a comparison cannot refer to a later candidate and erase an unreviewed finding', () => {
  const { progress, pool } = advanceReview(input, openReview(input), [], {
    kind: 'discover',
    run: 1,
    candidates: [finding, { ...finding, title: 'Explain another problem' }],
  });
  throws(
    () =>
      advanceReview(input, progress, pool, {
        kind: 'compare',
        run: 1,
        duplicates: [{ candidate: 1, of: 2 }],
      }),
    /candidate 1 must duplicate a pool ID or an earlier candidate/u,
  );
});
