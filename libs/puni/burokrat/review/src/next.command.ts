import { constant, message, object, option, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { NextRequest, ReviewWorkflow } from './contract';
import { taskCommand } from './output.command';

/** `next --state FILE`: read the current review task as JSON. */
export const reviewNextParser = object({
  kind: constant('review next'),
  state: option('--state', string({ metavar: 'FILE' }), {
    description: message`Read the review journal at this path.`,
  }),
});

/** Reads the review's current task or reports its refusal or input defect. */
export function createReviewNextCommand({
  reviewWorkflow,
}: {
  readonly reviewWorkflow: ReviewWorkflow;
}): Command<NextRequest> {
  return taskCommand((cwd, request) => reviewWorkflow.next(cwd, request));
}
