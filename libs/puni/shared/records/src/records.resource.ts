import { posix } from 'node:path';
import {
  type CheckoutFiles,
  FileUnreadable,
  parseFrontMatter,
  recordDirectories,
  recordKinds,
  repositoryScope,
} from '@puni/shared-checkout';
import { describeCause } from '@puni/shared-failures';
import type { RecordDraft, RecordsCatalog, RecordsRequirements } from './contract';
import {
  BodyFileMissing,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
} from './failures';
import { fieldOrder, formatRecord, type RecordFields, slugifyTitle } from './record-text';
import { judgeRecordValue, recordKeyForms } from './record-values';

/**
 * The body of `draft`: its body file's text, or `# <title>` without one.
 *
 * @throws BodyFileMissing when the body file names nothing.
 * @throws FileUnreadable when it exists but cannot be read.
 */
function readBody(
  draft: RecordDraft,
  title: string,
  fileSystem: RecordsRequirements['fileSystem'],
): string {
  const { bodyFile } = draft;
  if (bodyFile === undefined) return `# ${title}`;
  if (fileSystem.stat(bodyFile, 'follow') === 'absent') {
    throw new BodyFileMissing({ details: { path: bodyFile } });
  }
  try {
    return fileSystem.readText(bodyFile);
  } catch (cause) {
    throw new FileUnreadable({ details: { path: bodyFile, reason: describeCause(cause) }, cause });
  }
}

/** The {@link RecordsCatalog}; a record it files is dated today in UTC by `clock`. */
export function createRecordsCatalog({ clock, fileSystem }: RecordsRequirements): RecordsCatalog {
  return {
    list: (files) =>
      files.listVisible(repositoryScope).flatMap((path) => {
        const kind = recordKinds.find(
          (candidate) => posix.dirname(path) === recordDirectories[candidate],
        );
        return kind === undefined ? [] : [{ path, kind }];
      }),
    readFrontMatter: (files, path) => parseFrontMatter(files.readText(path)),
    file(files: CheckoutFiles, draft) {
      const title = draft.title.trim();
      const date = clock.now().toISOString().slice(0, 10);
      const slug = slugifyTitle(title);
      const path = `${recordDirectories[draft.kind]}/${date}-${slug}.md`;
      const fields: RecordFields = {
        kind: draft.kind,
        title,
        date,
        commit: draft.commit.trim(),
        topics: draft.topics
          .split(',')
          .map((topic) => topic.trim())
          .join(', '),
        summary: draft.summary.trim(),
      };
      for (const key of fieldOrder) {
        const problem = judgeRecordValue({ path, kind: draft.kind }, key, fields[key]);
        if (problem !== undefined) {
          throw new RecordValueRefused({ details: { key, problem, form: recordKeyForms[key] } });
        }
      }
      if (slug === '') throw new RecordTitleUnsluggable({ details: { title } });
      if (files.describe(path) !== 'absent') throw new RecordExists({ details: { path } });
      files.write(path, formatRecord(fields, readBody(draft, title, fileSystem)));
      return path;
    },
  };
}
