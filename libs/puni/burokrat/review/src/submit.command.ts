import { constant, message, object, option, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { ReviewWorkflow, SubmitRequest } from './contract';
import { taskCommand } from './output.command';

/** `submit --state FILE --result FILE`: accept an agent response and return the next task as JSON. */
export const reviewSubmitParser = object({
  kind: constant('review submit'),
  state: option('--state', string({ metavar: 'FILE' }), {
    description: message`Read and advance the review journal at this path.`,
  }),
  responseFile: option('--result', string({ metavar: 'FILE' }), {
    description: message`Read the current step's response from this JSON file.`,
  }),
});

/** Advances the review or reports its refusal or input defect. */
export function createReviewSubmitCommand({
  reviewWorkflow,
}: {
  readonly reviewWorkflow: ReviewWorkflow;
}): Command<SubmitRequest> {
  return taskCommand((cwd, request) => reviewWorkflow.submit(cwd, request));
}
