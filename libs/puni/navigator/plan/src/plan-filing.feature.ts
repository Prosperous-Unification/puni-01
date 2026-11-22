import { resolve } from 'node:path';
import { checkoutDefects, FileUnreadable } from '@puni/shared-checkout';
import { findDefect } from '@puni/shared-failures';
import {
  BodyFileMissing,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
} from '@puni/shared-records';
import type { PlanFiling, PlanRequirements } from './contract';

/** Whether `caught` is a refusal of what the command line asked to file. */
function isRefusal(caught: unknown): caught is Error {
  return (
    caught instanceof RecordValueRefused ||
    caught instanceof RecordTitleUnsluggable ||
    caught instanceof RecordExists ||
    caught instanceof BodyFileMissing
  );
}

/**
 * The {@link PlanFiling}. From the repository holding the nearest `puni.json` it finds the
 * system-state and records checkouts through the registry, reads the system-state `HEAD` commit,
 * and files a `plan` record there through the records catalog, which dates it. A value the
 * records schema refuses, a title with no letter or digit, an existing record or a missing body
 * file is `refused`; a registry or checkout that cannot be found, a system-state repository with
 * no commit, or a body file that cannot be read is `defective`, a defect's reason ending in
 * `; fix: <remedy>`. Anything else propagates.
 */
export function createPlanFiling({
  checkoutRegistry,
  checkoutFiles,
  recordsCatalog,
}: PlanRequirements): PlanFiling {
  return {
    file(cwd, request) {
      try {
        const found = checkoutRegistry.locate(cwd);
        const state = checkoutRegistry.resolve(found, 'system-state');
        const records = checkoutRegistry.resolve(found, 'system-records');
        const commit = checkoutFiles.open(state.root, state.type).readHeadCommit();
        const path = recordsCatalog.file(checkoutFiles.open(records.root, records.type), {
          kind: 'plan',
          title: request.title,
          topics: request.topics,
          summary: request.summary,
          commit,
          bodyFile: request.bodyFile === undefined ? undefined : resolve(cwd, request.bodyFile),
        });
        return { kind: 'filed', path };
      } catch (caught) {
        if (isRefusal(caught)) return { kind: 'refused', reason: caught.message };
        if (caught instanceof FileUnreadable) return { kind: 'defective', reason: caught.message };
        const defect = findDefect(caught, checkoutDefects);
        if (defect === undefined) throw caught;
        return { kind: 'defective', reason: `${defect.message}; fix: ${defect.remedy}` };
      }
    },
  };
}
