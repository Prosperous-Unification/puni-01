import { constant, message, object, option, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { ReviewWorkflow, StartRequest } from './contract';
import { taskCommand } from './output.command';

/** `start --request FILE --state FILE`: pin inputs and return a discovery task as JSON. */
export const reviewStartParser = object({
  kind: constant('review start'),
  request: option('--request', string({ metavar: 'FILE' }), {
    description: message`Read the review request from this JSON file.`,
  }),
  state: option('--state', string({ metavar: 'FILE' }), {
    description: message`Create a new review journal at this path.`,
  }),
});

/** Starts the review or reports its refusal or input defect. */
export function createReviewStartCommand({
  reviewWorkflow,
}: {
  readonly reviewWorkflow: ReviewWorkflow;
}): Command<StartRequest> {
  return taskCommand((cwd, request) => reviewWorkflow.start(cwd, request));
}
