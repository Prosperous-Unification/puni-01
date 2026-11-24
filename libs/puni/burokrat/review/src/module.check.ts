import { DiBag } from 'di-bag';
import type { ReviewRequirements } from './contract';
import { burokratReviewModule } from './module';
import { createReviewJournal } from './review-journal.resource';
import { createReviewSource } from './review-source.resource';

declare const requirements: ReviewRequirements &
  Parameters<typeof createReviewJournal>[0] &
  Parameters<typeof createReviewSource>[0];

DiBag.createBuilder()
  .withInstalledModules([burokratReviewModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    checkoutFiles: () => requirements.checkoutFiles,
    recordsCatalog: () => requirements.recordsCatalog,
    reviewTemplates: () => requirements.reviewTemplates,
    fileSystem: () => requirements.fileSystem,
    processRunner: () => requirements.processRunner,
    workingTreeDigest: () => requirements.workingTreeDigest,
  })
  .verifyGraphAtCompileTime() satisfies void;
