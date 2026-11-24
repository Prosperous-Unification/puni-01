import { parseJson, type RecordKind } from '@puni/shared-checkout';
import { parseReviewRecord, type ReviewRecord } from './review-record';

/** A labeled bullet holding text on one line, with control characters escaped. */
function bullet(label: string, value: string): string {
  return `- ${label}: ${JSON.stringify(value).slice(1, -1)}`;
}

function optionalBullet(label: string, value: string | undefined): string[] {
  return value === undefined ? [] : [bullet(label, value)];
}

/** Renders review fields after they have been validated. */
function renderBody(review: ReviewRecord): string {
  const {
    subject,
    instruction,
    criteria,
    template,
    snapshot,
    model,
    effort,
    runs,
    maxRuns,
    stop,
    findings,
  } = review;
  return [
    [
      '# Review',
      bullet('Subject', subject),
      bullet('Instruction', instruction),
      ...optionalBullet('Snapshot', snapshot),
      ...optionalBullet('Model', model),
      ...optionalBullet('Effort', effort),
      ...optionalBullet('Template', template?.id),
      ...optionalBullet('Template version', template?.version),
    ].join('\n'),
    '## Criteria',
    ...criteria.map(({ id, goal, guidance }) =>
      [`### ${id}`, bullet('Goal', goal), ...optionalBullet('Guidance', guidance)].join('\n'),
    ),
    [
      '## Runs',
      bullet('New findings per run', runs.join(', ')),
      bullet('Run limit', String(maxRuns)),
      bullet('Stop', stop),
    ].join('\n'),
    '## Findings',
    ...(findings.length === 0
      ? ['No findings.']
      : findings.map((finding) =>
          [
            `### ${finding.id}`,
            bullet('Title', finding.title),
            bullet('Criteria', finding.criteria.join(', ')),
            ...finding.evidence.map((value) => bullet('Evidence', value)),
            bullet('Improvement', finding.improvement),
            bullet('Impact', String(finding.impact)),
            bullet('Rationale', finding.rationale),
          ].join('\n'),
        )),
  ].join('\n\n');
}

/**
 * Renders a review as its Markdown body, preserving every review field.
 *
 * @throws Error when the review fails validation.
 */
export function formatReviewBody(review: ReviewRecord): string {
  return renderBody(parseReviewRecord(review));
}

function value(line: string, label: string): string {
  const prefix = `- ${label}: `;
  if (!line.startsWith(prefix)) throw new Error(`must have a ${label} field`);
  const decoded = parseJson(`"${line.slice(prefix.length)}"`);
  if ('problem' in decoded || typeof decoded.value !== 'string') {
    throw new Error(`${label} must be text with any control characters escaped`);
  }
  return decoded.value;
}

/**
 * A cursor over a block of Markdown bullets. Required fields advance the cursor, optional and
 * repeated fields do so only while they match.
 */
function readBlock(lines: readonly string[]) {
  let next = 0;
  const take = (label: string): string => value(lines[next++] ?? '', label);
  const has = (label: string): boolean => lines[next]?.startsWith(`- ${label}: `) === true;
  return {
    take,
    optional: (label: string): string | undefined => (has(label) ? take(label) : undefined),
    repeated(label: string): string[] {
      const values: string[] = [];
      while (has(label)) values.push(take(label));
      return values;
    },
    finish(section: string) {
      if (next < lines.length) throw new Error(`${section} has an unexpected field`);
    },
  };
}

function readFinding(block: string) {
  const [heading = '', ...lines] = block.split('\n');
  if (!heading.startsWith('### '))
    throw new Error('each Findings entry must have a ### ID heading');
  const fields = readBlock(lines);
  const finding = {
    id: heading.slice(4),
    title: fields.take('Title'),
    criteria: fields.take('Criteria').split(', '),
    evidence: fields.repeated('Evidence'),
    improvement: fields.take('Improvement'),
    impact: Number(fields.take('Impact')),
    rationale: fields.take('Rationale'),
  };
  fields.finish('the finding');
  return finding;
}

function readCriterion(block: string) {
  const [heading = '', ...lines] = block.split('\n');
  if (!heading.startsWith('### '))
    throw new Error('each Criteria entry must have a ### ID heading');
  const fields = readBlock(lines);
  const criterion = {
    id: heading.slice(4),
    goal: fields.take('Goal'),
    guidance: fields.optional('Guidance'),
  };
  fields.finish('the criterion');
  return criterion;
}

function readHeader(block: string) {
  const [heading, ...lines] = block.split('\n');
  if (heading !== '# Review') throw new Error('must have a # Review section');
  const fields = readBlock(lines);
  const subject = fields.take('Subject');
  const instruction = fields.take('Instruction');
  const snapshot = fields.optional('Snapshot');
  const model = fields.optional('Model');
  const effort = fields.optional('Effort');
  const template = fields.optional('Template');
  const version = template === undefined ? undefined : fields.take('Template version');
  fields.finish('the Review section');
  return {
    subject,
    instruction,
    snapshot,
    model,
    effort,
    template: template === undefined ? undefined : { id: template, version },
  };
}

function readRuns(block: string) {
  const [, ...lines] = block.split('\n');
  const fields = readBlock(lines);
  const runList = fields.take('New findings per run');
  const runs = runList === '' ? [] : runList.split(', ').map(Number);
  const maxRuns = Number(fields.take('Run limit'));
  const stop = fields.take('Stop');
  fields.finish('the Runs section');
  return { runs, maxRuns, stop };
}

/** Reads the canonical Markdown, then applies the same invariants as an in-memory review. */
function parseBody(body: string): ReviewRecord {
  const [header = '', criteriaHeader, ...blocks] = body.split('\n\n');
  const fields = readHeader(header);
  if (criteriaHeader !== '## Criteria') throw new Error('must have a ## Criteria section');
  const runs = blocks.findIndex((block) => block.startsWith('## Runs\n') || block === '## Runs');
  const runsBlock = blocks[runs];
  if (runsBlock === undefined) throw new Error('must have a ## Runs section');
  if (blocks[runs + 1] !== '## Findings') throw new Error('must have a ## Findings section');
  const findingBlocks = blocks.slice(runs + 2);
  if (findingBlocks.length === 0 || findingBlocks[0] === '') {
    throw new Error('the Findings section must have finding entries or say No findings.');
  }
  const review = parseReviewRecord({
    ...fields,
    criteria: blocks.slice(0, runs).map(readCriterion),
    ...readRuns(runsBlock),
    findings:
      findingBlocks.length === 1 && findingBlocks[0] === 'No findings.'
        ? []
        : findingBlocks.map(readFinding),
  });
  if (renderBody(review) !== body) throw new Error('must use the generated review Markdown format');
  return review;
}

/** Whether a record kind takes a structured review body. */
export function isReviewRecordKind(kind: RecordKind): kind is 'finding' | 'assessment-review' {
  return kind === 'finding' || kind === 'assessment-review';
}

/** The first problem with a structured review body, if any. Other kinds allow free-form bodies. */
export function judgeReviewBody(kind: RecordKind, body: string): string | undefined {
  if (!isReviewRecordKind(kind)) return undefined;
  try {
    const review = parseBody(body.replaceAll('\r\n', '\n').replace(/\n+$/u, ''));
    if (kind === 'assessment-review' && review.template === undefined) {
      return 'must name the assessment template and its version';
    }
    if (kind === 'finding' && review.template !== undefined) {
      return 'must omit the template unless the record is an assessment review';
    }
    return undefined;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return cause.message;
  }
}
