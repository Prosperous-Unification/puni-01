import { isRecord, requireOnlyKeys } from '@puni/shared-checkout';
import {
  parseReviewCandidate,
  parseReviewRecord,
  reviewStopReason,
  type ReviewCandidate,
  type ReviewRecord,
} from '@puni/shared-records';
import type { PooledFinding, ReviewInput, ReviewProgress, ReviewTask } from './contract';
import { refuseReview } from './failures';
import { reviewText } from './review-input';

/** The first task always discovers independently. */
export function openReview(input: ReviewInput): ReviewProgress {
  return { task: { ...input, kind: 'discover', run: 1 }, runs: [] };
}

function completeReview(
  input: ReviewInput,
  runs: readonly number[],
  findings: ReviewRecord['findings'],
): ReviewProgress {
  const { subject, instruction, criteria, template, snapshot, model, effort, maxRuns } = input;
  const review = parseReviewRecord({
    subject,
    instruction,
    criteria,
    template,
    snapshot,
    model,
    effort,
    runs,
    maxRuns,
    stop: reviewStopReason(runs, maxRuns),
    findings,
  });
  return { task: { ...review, kind: 'complete' }, runs };
}

function closeDiscovery(
  input: ReviewInput,
  previousRuns: readonly number[],
  pool: readonly PooledFinding[],
  added: number,
): ReviewProgress {
  const runs = [...previousRuns, added];
  if (reviewStopReason(runs, input.maxRuns) === undefined) {
    return { task: { ...input, kind: 'discover', run: runs.length + 1 }, runs };
  }
  if (pool.length === 0) return completeReview(input, runs, []);
  return { task: { ...input, kind: 'score', findings: pool }, runs };
}

function parseCandidates(value: unknown, criteria: ReviewInput['criteria']): ReviewCandidate[] {
  if (!Array.isArray(value)) refuseReview('candidates must be a list');
  return value.map((candidate: unknown) => {
    try {
      return parseReviewCandidate(candidate, criteria);
    } catch (cause) {
      return refuseReview(cause instanceof Error ? cause.message : String(cause));
    }
  });
}

function discover(
  input: ReviewInput,
  previousRuns: readonly number[],
  pool: readonly PooledFinding[],
  task: Extract<ReviewTask, { kind: 'discover' }>,
  response: Record<string, unknown>,
): ReviewProgress {
  requireOnlyKeys(response, ['kind', 'run', 'candidates'], 'discovery result', refuseReview);
  if (response['run'] !== task.run) refuseReview(`expected discovery run ${String(task.run)}`);
  const candidates = parseCandidates(response['candidates'], input.criteria);
  if (candidates.length === 0) return closeDiscovery(input, previousRuns, pool, 0);
  return {
    task: { ...input, kind: 'compare', run: task.run, candidates, pool },
    runs: previousRuns,
  };
}

function duplicateTargets(
  value: unknown,
  candidates: readonly ReviewCandidate[],
  pool: readonly PooledFinding[],
): Map<number, string | number> {
  if (!Array.isArray(value)) refuseReview('duplicates must be a list');
  const targets = new Map<number, string | number>();
  const ids = new Set(pool.map(({ id }) => id));
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) refuseReview('each duplicate must name candidate and of');
    requireOnlyKeys(entry, ['candidate', 'of'], 'duplicate', refuseReview);
    const candidate = entry['candidate'];
    const of = entry['of'];
    if (
      typeof candidate !== 'number' ||
      !Number.isInteger(candidate) ||
      candidate < 1 ||
      candidate > candidates.length ||
      targets.has(candidate)
    ) {
      refuseReview('duplicate candidate must be a unique 1-based candidate position');
    }
    if (typeof of === 'string' && ids.has(of)) targets.set(candidate, of);
    else if (typeof of === 'number' && Number.isInteger(of) && of >= 1 && of < candidate)
      targets.set(candidate, of);
    else
      refuseReview(
        `candidate ${String(candidate)} must duplicate a pool ID or an earlier candidate`,
      );
  }
  return targets;
}

function compare(
  input: ReviewInput,
  previousRuns: readonly number[],
  task: Extract<ReviewTask, { kind: 'compare' }>,
  response: Record<string, unknown>,
): { readonly progress: ReviewProgress; readonly pool: readonly PooledFinding[] } {
  requireOnlyKeys(response, ['kind', 'run', 'duplicates'], 'comparison result', refuseReview);
  if (response['run'] !== task.run) refuseReview(`expected comparison for run ${String(task.run)}`);
  const targets = duplicateTargets(response['duplicates'], task.candidates, task.pool);
  const pool = new Map(task.pool.map((finding) => [finding.id, finding]));
  const positions = new Map<number, string>();
  for (const [index, candidate] of task.candidates.entries()) {
    const position = index + 1;
    const target = targets.get(position);
    const id =
      (typeof target === 'number' ? positions.get(target) : target) ?? `f-${String(pool.size + 1)}`;
    positions.set(position, id);
    const existing = pool.get(id);
    pool.set(
      id,
      existing === undefined
        ? { ...candidate, id }
        : {
            ...existing,
            criteria: [...new Set([...existing.criteria, ...candidate.criteria])],
            evidence: [...new Set([...existing.evidence, ...candidate.evidence])],
          },
    );
  }
  const findings = [...pool.values()];
  return {
    pool: findings,
    progress: closeDiscovery(input, previousRuns, findings, pool.size - task.pool.length),
  };
}

function score(
  input: ReviewInput,
  previousRuns: readonly number[],
  task: Extract<ReviewTask, { kind: 'score' }>,
  response: Record<string, unknown>,
): ReviewProgress {
  requireOnlyKeys(response, ['kind', 'scores'], 'scoring result', refuseReview);
  const scores = response['scores'];
  if (!Array.isArray(scores)) refuseReview('scores must be a list');
  const scoreById = new Map<string, { impact: number; rationale: string }>();
  const ids = new Set(task.findings.map(({ id }) => id));
  for (const entry of scores as unknown[]) {
    if (!isRecord(entry)) refuseReview('each score must name id, impact and rationale');
    requireOnlyKeys(entry, ['id', 'impact', 'rationale'], 'score', refuseReview);
    const id = reviewText(entry['id'], 'score.id');
    const impact = entry['impact'];
    if (!ids.has(id) || scoreById.has(id)) refuseReview(`unexpected or duplicate score for ${id}`);
    if (typeof impact !== 'number' || !Number.isInteger(impact) || impact < 1 || impact > 10) {
      refuseReview(`impact for ${id} must be an integer from 1 to 10`);
    }
    scoreById.set(id, { impact, rationale: reviewText(entry['rationale'], `rationale for ${id}`) });
  }
  const findings = task.findings
    .map((finding) => {
      const assigned = scoreById.get(finding.id);
      if (assigned === undefined) refuseReview(`missing score for ${finding.id}`);
      return { ...finding, ...assigned };
    })
    .sort((left, right) => right.impact - left.impact);
  return completeReview(input, previousRuns, findings);
}

/** Keeps the pool outside discovery prompts and accepts only the currently expected response. */
export function advanceReview(
  input: ReviewInput,
  state: ReviewProgress,
  pool: readonly PooledFinding[],
  response: unknown,
): { readonly progress: ReviewProgress; readonly pool: readonly PooledFinding[] } {
  const { task, runs } = state;
  if (task.kind === 'complete') refuseReview('this review is already complete');
  if (!isRecord(response) || response['kind'] !== task.kind)
    refuseReview(`expected a ${task.kind} result`);
  switch (task.kind) {
    case 'discover':
      return { pool, progress: discover(input, runs, pool, task, response) };
    case 'compare':
      return compare(input, runs, task, response);
    case 'score':
      return { pool, progress: score(input, runs, task, response) };
  }
}
