import { constant, message, object, option, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { FileRequest, ReviewWorkflow } from './contract';
import { reportReview } from './output.command';

/** `file --state FILE --title TEXT --topics LIST --summary TEXT`: file the reviewed result. */
export const reviewFileParser = object({
  kind: constant('review file'),
  state: option('--state', string({ metavar: 'FILE' }), {
    description: message`Read the completed review journal at this path.`,
  }),
  title: option('--title', string({ metavar: 'TEXT' }), {
    description: message`Name the review record.`,
  }),
  topics: option('--topics', string({ metavar: 'LIST' }), {
    description: message`Give the record comma-separated topics.`,
  }),
  summary: option('--summary', string({ metavar: 'TEXT' }), {
    description: message`Summarize the review on one line.`,
  }),
});

/** Files the review, printing its path and findings by descending impact, or reports a failure. */
export function createReviewFileCommand({
  reviewWorkflow,
}: {
  readonly reviewWorkflow: ReviewWorkflow;
}): Command<FileRequest> {
  return {
    run(request, io) {
      return reportReview(io, () => {
        const { path, findings } = reviewWorkflow.file(io.cwd, request);
        const lines = findings.map(
          ({ id, impact, title }) => `${String(impact)}/10 ${id} ${title.replace(/\s+/gu, ' ')}`,
        );
        return [path, ...(lines.length === 0 ? ['No findings.'] : lines)].join('\n');
      });
    },
  };
}
