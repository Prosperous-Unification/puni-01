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
  RecordBodyRefused,
  RecordExists,
  RecordTitleUnsluggable,
  RecordValueRefused,
} from './failures';
import { fieldOrder, formatRecord, type RecordFields, slugifyTitle } from './record-text';
import { judgeRecordValue, recordKeyForms } from './record-values';
import { judgeReviewBody } from './review-markdown';

/**
 * The body of `draft`: inline Markdown, its body file's text, or `# <title>` and an empty
 * `## <heading>` section for each of its `sections`.
 *
 * @throws RecordBodyRefused when both body sources are supplied.
 * @throws BodyFileMissing when the body file names nothing.
 * @throws FileUnreadable when it exists but cannot be read.
 */
function readBody(
  draft: RecordDraft,
  title: string,
  fileSystem: RecordsRequirements['fileSystem'],
): string {
  const { body, bodyFile, sections = [] } = draft;
  if (body !== undefined) {
    if (bodyFile !== undefined) {
      throw new RecordBodyRefused({ details: { problem: 'must have only one source' } });
    }
    return body;
  }
  if (bodyFile === undefined) {
    return [`# ${title}`, ...sections.map((heading) => `## ${heading}`)].join('\n\n');
  }
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
export function createRecordsCatalog({
  clock,
  fileSystem,
}: Pick<RecordsRequirements, 'clock' | 'fileSystem'>): RecordsCatalog {
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
      const body = readBody(draft, title, fileSystem);
      const problem = judgeReviewBody(draft.kind, body);
      if (problem !== undefined) throw new RecordBodyRefused({ details: { problem } });
      if (files.createFile(path, formatRecord(fields, body)) === 'exists') {
        throw new RecordExists({ details: { path } });
      }
      return path;
    },
  };
}
