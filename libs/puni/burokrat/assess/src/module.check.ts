import { DiBag } from 'di-bag';
import type { AcceptedOutcomesRequirements } from './accepted-outcomes.resource';
import type { AssessRequirements } from './contract';
import type { HarnessLogsRequirements } from './harness-logs.resource';
import { burokratAssessModule } from './module';
import type { RateCardRequirements } from './rate-card.resource';

declare const requirements: AssessRequirements &
  AcceptedOutcomesRequirements &
  HarnessLogsRequirements &
  RateCardRequirements;

DiBag.createBuilder()
  .withInstalledModules([burokratAssessModule])
  .withServices({
    checkoutRegistry: () => requirements.checkoutRegistry,
    reviewTemplates: () => requirements.reviewTemplates,
    fileSystem: () => requirements.fileSystem,
    git: () => requirements.git,
  })
  .verifyGraphAtCompileTime() satisfies void;
