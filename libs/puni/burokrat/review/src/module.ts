import { DiBag } from 'di-bag';
import { createReviewFileCommand } from './file.command';
import { createReviewNextCommand } from './next.command';
import { createReviewJournal } from './review-journal.resource';
import { createReviewSource } from './review-source.resource';
import { createReviewWorkflow } from './review.feature';
import { createReviewStartCommand } from './start.command';
import { createReviewSubmitCommand } from './submit.command';

/** The review task workflow and its command handlers. */
export const burokratReviewModule = DiBag.createBuilder()
  .withServices({ reviewJournal: createReviewJournal, reviewSource: createReviewSource })
  .withServices({ reviewWorkflow: createReviewWorkflow })
  .withServices({
    burokratReviewStartCommand: createReviewStartCommand,
    burokratReviewNextCommand: createReviewNextCommand,
    burokratReviewSubmitCommand: createReviewSubmitCommand,
    burokratReviewFileCommand: createReviewFileCommand,
  })
  .buildModule({
    exportedServiceKeys: [
      'burokratReviewStartCommand',
      'burokratReviewNextCommand',
      'burokratReviewSubmitCommand',
      'burokratReviewFileCommand',
    ],
    moduleLabel: 'puni-burokrat-review',
  });
