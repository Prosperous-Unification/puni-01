import { resolve } from 'node:path';
import { explainDefect } from '@puni/shared-checkout';
import type { RecordFiling, RecordsCatalog, RecordsRequirements } from './contract';
import {
  BodyFileMissing,
  RecordBodyRefused,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
  SupersededRecordRefused,
} from './failures';

/** Whether `caught` is a refusal of what the command line asked to file. */
function isRefusal(caught: unknown): caught is Error {
  return (
    caught instanceof RecordValueRefused ||
    caught instanceof RecordBodyRefused ||
    caught instanceof RecordTitleUnsluggable ||
    caught instanceof RecordExists ||
    caught instanceof BodyFileMissing ||
    caught instanceof SupersededRecordRefused
  );
}

/**
 * The {@link RecordFiling}, the one filing path of every `<group> add` command. From the
 * repository holding the nearest `puni.json` it finds the system-state and records checkouts
 * through the registry, reads the system-state `HEAD` commit, and files the record there through
 * the records catalog, which dates it. A value or body the records schema refuses, a title with no
 * letter or digit, an existing record, a missing body file or a record that cannot be superseded is `refused`; a registry or checkout that
 * cannot be found, a system-state repository with no commit, or a body file that cannot be read
 * is `defective`, a defect's reason ending in `; fix: <remedy>`. Anything else propagates.
 */
export function createRecordFiling({
  checkoutRegistry,
  checkoutFiles,
  recordsCatalog,
}: Pick<RecordsRequirements, 'checkoutRegistry' | 'checkoutFiles'> & {
  readonly recordsCatalog: RecordsCatalog;
}): RecordFiling {
  return {
    file(cwd, shape, request) {
      try {
        const found = checkoutRegistry.locate(cwd);
        const state = checkoutRegistry.resolve(found, 'system-state');
        const records = checkoutRegistry.resolve(found, 'system-records');
        const commit = checkoutFiles.open(state.root, state.type).readHeadCommit();
        const path = recordsCatalog.file(checkoutFiles.open(records.root, records.type), {
          kind: shape.kind,
          title: request.title,
          topics: request.topics,
          summary: request.summary,
          commit,
          bodyFile: request.bodyFile === undefined ? undefined : resolve(cwd, request.bodyFile),
          sections: shape.sections,
          supersedes: request.supersedes,
        });
        return { kind: 'filed', path };
      } catch (caught) {
        if (isRefusal(caught)) return { kind: 'refused', reason: caught.message };
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'defective', reason };
      }
    },
  };
}
