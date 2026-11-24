import { isRecord, requireOnlyKeys } from '@puni/shared-checkout';
import { parseReviewCriteria, type ReviewTemplates } from '@puni/shared-records';
import type { ReviewInput } from './contract';
import { refuseReview } from './failures';

const defaultRunLimit = 5;

/** Requires a nonempty text field and gives callers a field-specific refusal. */
export function reviewText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    refuseReview(`${field} must be nonempty text`);
  return value.trim();
}

function settings(value: Record<string, unknown>) {
  const maxRuns = value['maxRuns'] === undefined ? defaultRunLimit : value['maxRuns'];
  if (typeof maxRuns !== 'number' || !Number.isSafeInteger(maxRuns) || maxRuns < 1) {
    refuseReview('maxRuns must be a positive integer');
  }
  const model = value['model'];
  const effort = value['effort'];
  return {
    subject: reviewText(value['subject'], 'subject'),
    instruction: reviewText(value['instruction'], 'instruction'),
    maxRuns,
    ...(model === undefined ? {} : { model: reviewText(model, 'model') }),
    ...(effort === undefined ? {} : { effort: reviewText(effort, 'effort') }),
  };
}

function templateReference(value: unknown) {
  if (!isRecord(value)) refuseReview('template must be an object with id and optional version');
  requireOnlyKeys(value, ['id', 'version'], 'template', refuseReview);
  const id = reviewText(value['id'], 'template.id');
  const version =
    value['version'] === undefined ? undefined : reviewText(value['version'], 'template.version');
  return { id, version };
}

function checkedCriteria(value: unknown) {
  try {
    return parseReviewCriteria(value);
  } catch (cause) {
    return refuseReview(cause instanceof Error ? cause.message : String(cause));
  }
}

/** Resolves a request into fixed criteria and review settings. */
export function readReviewRequest(value: unknown, root: string, templates: ReviewTemplates) {
  if (!isRecord(value)) refuseReview('review request must be a JSON object');
  requireOnlyKeys(
    value,
    ['subject', 'instruction', 'maxRuns', 'model', 'effort', 'criteria', 'template', 'workingTree'],
    'review request',
    refuseReview,
  );
  const base = settings(value);
  const workingTree = value['workingTree'] === undefined ? false : value['workingTree'];
  if (typeof workingTree !== 'boolean') refuseReview('workingTree must be true or false');
  const reference = value['template'];
  if (reference === undefined)
    return { ...base, criteria: checkedCriteria(value['criteria']), workingTree };
  if (value['criteria'] !== undefined) refuseReview('choose exactly one of criteria and template');
  const { id, version } = templateReference(reference);
  const { criteria, ...template } = templates.load(root, id, version);
  return { ...base, criteria, template, workingTree };
}

/** Validates the frozen review input on reopening the journal. */
export function readReviewInput(value: unknown): ReviewInput {
  if (!isRecord(value)) refuseReview('review state must hold a frozen input object');
  const root = reviewText(value['root'], 'root');
  const commit = reviewText(value['commit'], 'commit');
  if (!/^[a-f0-9]{40}$/u.test(commit)) refuseReview('commit must be a full git commit hash');
  const snapshot = value['snapshot'];
  if (
    snapshot !== undefined &&
    (typeof snapshot !== 'string' || !/^[a-f0-9]{64}$/u.test(snapshot))
  ) {
    refuseReview('snapshot must be a SHA-256 digest');
  }
  const reference = value['template'];
  const template = reference === undefined ? undefined : templateReference(reference);
  if (template !== undefined && template.version === undefined)
    refuseReview('review state must pin its template version');
  return {
    ...settings(value),
    root,
    commit,
    criteria: checkedCriteria(value['criteria']),
    ...(snapshot === undefined ? {} : { snapshot }),
    ...(template?.version === undefined
      ? {}
      : { template: { id: template.id, version: template.version } }),
  };
}
