import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  formatReviewBody,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
} from '@puni/shared-records';
import type {
  PooledFinding,
  ReviewJournal,
  ReviewRequirements,
  ReviewSource,
  ReviewWorkflow,
} from './contract';
import { refuseReview } from './failures';
import { readReviewRequest } from './review-input';
import { advanceReview, openReview } from './review-progress';

function journalPath(cwd: string, path: string, root: string, needsOutside: boolean): string {
  const absolute = resolve(cwd, path);
  const local = relative(root, absolute);
  const outside = isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`);
  if (needsOutside && !outside) {
    refuseReview('put the review journal outside the code checkout for a working tree review');
  }
  return absolute;
}

/** Controls the ordered review tasks and files the final scored record into the private checkout. */
export function createReviewWorkflow({
  checkoutRegistry,
  checkoutFiles,
  recordsCatalog,
  reviewTemplates,
  reviewJournal,
  reviewSource,
}: ReviewRequirements & {
  readonly reviewJournal: ReviewJournal;
  readonly reviewSource: ReviewSource;
}): ReviewWorkflow {
  function reopen(cwd: string, location: string) {
    const found = checkoutRegistry.locate(cwd);
    const root = checkoutRegistry.resolve(found, 'system-state').root;
    const path = resolve(cwd, location);
    const { input, results } = reviewJournal.read(path);
    if (input.root !== root) refuseReview('the review journal belongs to another code checkout');
    journalPath(cwd, location, root, input.snapshot !== undefined);
    reviewSource.verify(input);
    const initial: { progress: ReturnType<typeof openReview>; pool: readonly PooledFinding[] } = {
      progress: openReview(input),
      pool: [],
    };
    const current = results.reduce<typeof initial>(
      (state, response) => advanceReview(input, state.progress, state.pool, response),
      initial,
    );
    return { ...current, found, input, path, index: results.length };
  }

  return {
    start(cwd, request) {
      const found = checkoutRegistry.locate(cwd);
      const { root } = checkoutRegistry.resolve(found, 'system-state');
      const { workingTree, ...settings } = readReviewRequest(
        reviewJournal.readInput(resolve(cwd, request.request)),
        root,
        reviewTemplates,
      );
      const path = journalPath(cwd, request.state, root, workingTree);
      const input = { ...settings, root, ...reviewSource.capture(root, workingTree) };
      reviewJournal.create(path, input);
      return openReview(input).task;
    },
    next(cwd, request) {
      return reopen(cwd, request.state).progress.task;
    },
    submit(cwd, request) {
      const { input, progress, pool, path, index } = reopen(cwd, request.state);
      const response = reviewJournal.readInput(resolve(cwd, request.responseFile));
      const next = advanceReview(input, progress, pool, response);
      reviewJournal.append(path, index, response);
      return next.progress.task;
    },
    file(cwd, request) {
      const {
        input,
        found,
        progress: { task },
      } = reopen(cwd, request.state);
      if (task.kind !== 'complete')
        refuseReview(`finish the ${task.kind} step before filing this review`);
      const records = checkoutRegistry.resolve(found, 'system-records');
      try {
        const path = recordsCatalog.file(checkoutFiles.open(records.root, records.type), {
          kind: task.template === undefined ? 'finding' : 'assessment-review',
          title: request.title,
          topics: request.topics,
          summary: request.summary,
          commit: input.commit,
          body: formatReviewBody(task),
        });
        return { path, findings: task.findings };
      } catch (cause) {
        if (
          cause instanceof RecordExists ||
          cause instanceof RecordValueRefused ||
          cause instanceof RecordTitleUnsluggable
        ) {
          refuseReview(cause.message);
        }
        throw cause;
      }
    },
  };
}
