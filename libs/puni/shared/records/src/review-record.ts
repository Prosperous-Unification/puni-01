import { isRecord } from '@puni/shared-checkout';
import { slugPattern } from './records-schema';

/** A criterion describing what the review should achieve. */
export interface ReviewCriterion {
  readonly id: string;
  readonly goal: string;
  readonly guidance?: string;
}

/** A potential improvement with cited evidence and the criteria it addresses. */
export interface ReviewCandidate {
  readonly title: string;
  readonly criteria: readonly string[];
  readonly evidence: readonly string[];
  readonly improvement: string;
}

/** The inputs, runs and scored findings of one review. */
export interface ReviewRecord {
  readonly subject: string;
  readonly instruction: string;
  readonly criteria: readonly ReviewCriterion[];
  readonly template?: { readonly id: string; readonly version: string };
  /** SHA-256 digest identifying a snapshot of the working copy, when included. */
  readonly snapshot?: string;
  readonly model?: string;
  readonly effort?: string;
  /** New findings added by each run, in order. */
  readonly runs: readonly number[];
  readonly maxRuns: number;
  readonly stop: 'no-new-findings' | 'run-limit';
  readonly findings: readonly (ReviewCandidate & {
    readonly id: string;
    readonly impact: number;
    readonly rationale: string;
  })[];
}

/** Refuses an invalid review field with the field's name and expected value. */
function refuse(field: string, expected: string): never {
  throw new Error(`${field} must ${expected}`);
}

function object(value: unknown, field: string): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : refuse(field, 'be an object');
}

function list(value: unknown, field: string): readonly unknown[] {
  return Array.isArray(value) ? Array.from(value) : refuse(field, 'be an array');
}

function nonempty<T>(values: readonly T[], field: string): readonly T[] {
  return values.length > 0 ? values : refuse(field, 'contain at least one entry');
}

function unique(values: readonly string[], field: string): readonly string[] {
  return new Set(values).size === values.length ? values : refuse(field, 'contain unique IDs');
}

function integer(
  value: unknown,
  field: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : refuse(field, `be an integer from ${String(min)} to ${String(max)}`);
}

function string(value: unknown, field: string): string {
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : refuse(field, 'be non-empty text');
}

function matching(value: unknown, field: string, pattern: RegExp, expected: string): string {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value
    ? value
    : refuse(field, expected);
}

function slug(value: unknown, field: string): string {
  return matching(
    value,
    field,
    slugPattern,
    'be a lowercase ID of letters and digits joined by hyphens',
  );
}

function readCriterion(value: unknown, index: number): ReviewCriterion {
  const field = `criteria[${String(index)}]`;
  const criterion = object(value, field);
  return {
    id: slug(criterion['id'], `${field}.id`),
    goal: string(criterion['goal'], `${field}.goal`),
    ...(criterion['guidance'] === undefined
      ? {}
      : { guidance: string(criterion['guidance'], `${field}.guidance`) }),
  };
}

function readCandidate(
  finding: Readonly<Record<string, unknown>>,
  field: string,
  criterionIds: ReadonlySet<string>,
): ReviewCandidate {
  const criteriaField = `${field}.criteria`;
  const criteria = unique(
    nonempty(list(finding['criteria'], criteriaField), criteriaField).map((value) => {
      const id = slug(value, criteriaField);
      return criterionIds.has(id)
        ? id
        : refuse(criteriaField, `reference a known criterion, got ${id}`);
    }),
    criteriaField,
  );
  const evidenceField = `${field}.evidence`;
  return {
    title: string(finding['title'], `${field}.title`),
    criteria,
    evidence: nonempty(list(finding['evidence'], evidenceField), evidenceField).map((value) =>
      string(value, evidenceField),
    ),
    improvement: string(finding['improvement'], `${field}.improvement`),
  };
}

/**
 * Parses a potential finding against the review's criteria.
 *
 * @throws Error when the candidate is missing a required field or refers to an unknown criterion.
 */
export function parseReviewCandidate(
  value: unknown,
  criteria: readonly ReviewCriterion[],
): ReviewCandidate {
  return readCandidate(
    object(value, 'candidate'),
    'candidate',
    new Set(criteria.map(({ id }) => id)),
  );
}

/**
 * Parses the criteria of a review, each with a unique ID.
 *
 * @throws Error when a criterion is invalid, an ID repeats, or there are no criteria.
 */
export function parseReviewCriteria(value: unknown): readonly ReviewCriterion[] {
  const criteria = nonempty(list(value, 'criteria'), 'criteria').map(readCriterion);
  unique(
    criteria.map(({ id }) => id),
    'criteria',
  );
  return criteria;
}

function readFinding(
  value: unknown,
  index: number,
  criterionIds: ReadonlySet<string>,
): ReviewRecord['findings'][number] {
  const field = `findings[${String(index)}]`;
  const finding = object(value, field);
  return {
    id: slug(finding['id'], `${field}.id`),
    ...readCandidate(finding, field, criterionIds),
    impact: integer(finding['impact'], `${field}.impact`, 1, 10),
    rationale: string(finding['rationale'], `${field}.rationale`),
  };
}

function readTemplate(value: unknown): NonNullable<ReviewRecord['template']> {
  const template = object(value, 'template');
  return {
    id: slug(template['id'], 'template.id'),
    version: matching(
      template['version'],
      'template.version',
      /^[1-9]\d*$/u,
      'be a positive whole-number version',
    ),
  };
}

/** The stop reason established by the discovery counts, if discovery is over. */
export function reviewStopReason(
  runs: readonly number[],
  maxRuns: number,
): ReviewRecord['stop'] | undefined {
  if (runs.length > 1 && runs.at(-1) === 0) return 'no-new-findings';
  if (runs.length === maxRuns) return 'run-limit';
  return undefined;
}

function readStop(
  stop: unknown,
  runs: readonly number[],
  maxRuns: number,
  count: number,
): ReviewRecord['stop'] {
  if (runs.length > maxRuns) refuse('runs', 'fit within maxRuns');
  if (runs.reduce((sum, run) => sum + run, 0) !== count) {
    refuse('runs', 'sum to the number of findings');
  }
  if (runs.slice(1, -1).includes(0)) {
    refuse('runs', 'end on the first follow-up run with zero new findings');
  }
  const expected = reviewStopReason(runs, maxRuns);
  if (expected !== undefined && stop === expected) return expected;
  return refuse(
    'stop',
    'be no-new-findings after a follow-up run that found nothing new, or run-limit when maxRuns is reached first',
  );
}

/**
 * Parses the review document, including criteria references, scores in descending order and a
 * stop reason supported by the run counts.
 *
 * @throws Error when a field or the relationship between fields is invalid.
 */
export function parseReviewRecord(value: unknown): ReviewRecord {
  const review = object(value, 'review');
  const criteria = parseReviewCriteria(review['criteria']);
  const criterionIds = new Set(criteria.map(({ id }) => id));
  const findings = list(review['findings'], 'findings').map((finding, index) =>
    readFinding(finding, index, criterionIds),
  );
  unique(
    findings.map(({ id }) => id),
    'findings.id',
  );
  let previous = Number.POSITIVE_INFINITY;
  for (const { impact } of findings) {
    if (impact > previous) refuse('findings', 'be ordered by descending impact');
    previous = impact;
  }
  const runs = nonempty(list(review['runs'], 'runs'), 'runs').map((run) => integer(run, 'runs', 0));
  const maxRuns = integer(review['maxRuns'], 'maxRuns', 1);
  return {
    subject: string(review['subject'], 'subject'),
    instruction: string(review['instruction'], 'instruction'),
    criteria,
    ...(review['template'] === undefined ? {} : { template: readTemplate(review['template']) }),
    ...(review['snapshot'] === undefined
      ? {}
      : {
          snapshot: matching(
            review['snapshot'],
            'snapshot',
            /^[a-f0-9]{64}$/u,
            'be a SHA-256 digest',
          ),
        }),
    ...(review['model'] === undefined ? {} : { model: string(review['model'], 'model') }),
    ...(review['effort'] === undefined ? {} : { effort: string(review['effort'], 'effort') }),
    runs,
    maxRuns,
    stop: readStop(review['stop'], runs, maxRuns, findings.length),
    findings,
  };
}
