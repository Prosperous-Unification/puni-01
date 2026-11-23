import { DiBag } from 'di-bag';
import { createAcceptedOutcomes } from './accepted-outcomes.resource';
import { createHarnessLogs } from './harness-logs.resource';
import { createOutcomeAssessment } from './outcome-assessment.feature';
import { createOutcomesCommand } from './outcomes.command';
import { createRateCards } from './rate-card.resource';

/** `puni burokrat assess`; the host supplies `checkoutRegistry`, `fileSystem` and `git`. */
export const burokratAssessModule = DiBag.createBuilder()
  .withServices({
    rateCards: createRateCards,
    acceptedOutcomes: createAcceptedOutcomes,
    harnessLogs: createHarnessLogs,
  })
  .withServices({ outcomeAssessment: createOutcomeAssessment })
  .withServices({ burokratAssessOutcomesCommand: createOutcomesCommand })
  .buildModule({
    exportedServiceKeys: ['burokratAssessOutcomesCommand'],
    moduleLabel: 'puni-burokrat-assess',
  });
