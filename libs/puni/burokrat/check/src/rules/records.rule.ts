import { posix } from 'node:path';
import { compareBytes, type FrontMatterField } from '@puni/shared-checkout';
import {
  type RecordFile,
  recordNamePattern,
  recordsTopLevel,
  requiredRecordKeys,
} from '@puni/shared-records';
import type { Finding, RuleReading } from '../finding';
import {
  describeSchema,
  groupDirectories,
  isCalendarDate,
  isRecordKey,
  judgeRecordValue,
  recordKeyForms,
} from '../record-values';

/**
 * Runs `judge` over the visible record files, or reports the git failure as one `rule` finding
 * at the repository root.
 */
function judgeRecordFiles(
  { files, records }: RuleReading,
  rule: string,
  judge: (recordFiles: readonly RecordFile[]) => Finding[],
): Finding[] {
  const listing = records.list(files);
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  return judge(listing.records);
}

/**
 * The records layout, over the paths git shows: only the names in {@link recordsTopLevel} at the
 * top level, only kind directories in `nav/` and `bur/`, and only regular files directly in a
 * kind directory. `dash/` is not inspected. Ignored files and empty directories are invisible.
 */
export function judgeRecordsLayout({ files }: RuleReading): Finding[] {
  const rule = 'records.layout';
  const listing = files.listVisibleEntries();
  if ('failure' in listing) return [{ rule, path: '.', message: listing.failure }];
  const found = new Map<string, string>();
  const allowedTop = Object.keys(recordsTopLevel).join(', ');
  for (const { path, kind } of listing.entries) {
    const [top = '', inner = '', ...rest] = path.split('/');
    const expected = recordsTopLevel[top];
    if (expected === undefined) {
      found.set(top, `is not part of the records layout; the top level holds only ${allowedTop}`);
      continue;
    }
    if ((expected === 'directory') !== path.includes('/')) {
      found.set(top, `must be a ${expected}`);
      continue;
    }
    const names = groupDirectories.get(top);
    if (names === undefined) continue;
    if (rest.length === 0 || !names.includes(inner)) {
      const message = `is not a kind directory; ${top}/ holds only the directories ${names.join(', ')}`;
      found.set(`${top}/${inner}`, message);
      continue;
    }
    const message = 'is not a regular file; a kind directory holds only record files';
    if (rest.length > 1) found.set(`${top}/${inner}/${rest[0] ?? ''}`, message);
    else if (kind !== 'file') found.set(path, message);
  }
  return [...found]
    .sort(([left], [right]) => compareBytes(left, right))
    .map(([path, message]) => ({ rule, path, message }));
}

/** Every record file is named `YYYY-MM-DD-<slug>.md` with a real calendar date. */
export function judgeRecordNames(reading: RuleReading): Finding[] {
  return judgeRecordFiles(reading, 'records.name', (recordFiles) =>
    recordFiles.flatMap(({ path }) => {
      const name = recordNamePattern.exec(posix.basename(path));
      if (name?.[1] !== undefined && isCalendarDate(name[1])) return [];
      return [
        {
          rule: 'records.name',
          path,
          message:
            'must be named YYYY-MM-DD-<slug>.md: a real calendar date, then lower-case letters and digits joined by single hyphens',
        },
      ];
    }),
  );
}

/**
 * Every record file opens with front matter holding exactly the keys of
 * {@link requiredRecordKeys}, optionally those of the optional record keys, each in its form. A
 * file without front matter gets one finding that states the whole schema.
 */
export function judgeRecordFrontMatter(reading: RuleReading): Finding[] {
  const rule = 'records.front-matter';
  const { files, records } = reading;
  return judgeRecordFiles(reading, rule, (recordFiles) =>
    recordFiles.flatMap((file) => {
      const frontMatter = records.readFrontMatter(files, file.path);
      const finding = (message: string): Finding => ({ rule, path: file.path, message });
      if ('problem' in frontMatter) {
        return [
          frontMatter.problem === 'absent'
            ? finding(
                `does not open with front matter: a --- line, one "key: value" per line, then a --- line; ${describeSchema()}`,
              )
            : finding(
                `has a malformed front matter line ${JSON.stringify(frontMatter.line)}; each line is "key: value"`,
              ),
        ];
      }
      const findings: Finding[] = [];
      const seen = new Set<string>();
      for (const { key, value } of frontMatter.fields) {
        if (seen.has(key)) findings.push(finding(`repeats the key ${key}; each key appears once`));
        seen.add(key);
        if (!isRecordKey(key)) {
          const allowed = Object.keys(recordKeyForms).join(', ');
          findings.push(finding(`has the unknown key ${key}; the keys are ${allowed}`));
          continue;
        }
        const problem = judgeRecordValue(file, key, value);
        if (problem !== undefined) {
          findings.push(finding(`${key} ${problem}; expected ${recordKeyForms[key]}`));
        }
      }
      for (const [key, form] of Object.entries(requiredRecordKeys)) {
        if (!seen.has(key)) findings.push(finding(`has no ${key}; expected ${form}`));
      }
      return findings;
    }),
  );
}

const opposite = { supersedes: 'superseded-by', 'superseded-by': 'supersedes' } as const;

/**
 * Every `supersedes` and `superseded-by` names another existing record in a kind directory, and
 * the named record answers with the opposite key naming this one.
 */
export function judgeSupersession(reading: RuleReading): Finding[] {
  const rule = 'records.supersession';
  const { files, records } = reading;
  const readFields = (path: string): readonly FrontMatterField[] => {
    const frontMatter = records.readFrontMatter(files, path);
    return 'fields' in frontMatter ? frontMatter.fields : [];
  };
  return judgeRecordFiles(reading, rule, (recordFiles) => {
    const paths = recordFiles.map((file) => file.path);
    return paths.flatMap((path) =>
      readFields(path).flatMap(({ key, value }): Finding[] => {
        if (key !== 'supersedes' && key !== 'superseded-by') return [];
        const target = posix.normalize(value);
        const finding = (message: string): Finding[] => [{ rule, path, message }];
        if (target === path) return finding(`${key} names the record itself`);
        if (!paths.includes(target)) {
          return finding(`${key} ${target} is not a record in a kind directory`);
        }
        const answer = opposite[key];
        const answered = readFields(target).some(
          (field) => field.key === answer && posix.normalize(field.value) === path,
        );
        return answered ? [] : finding(`${key} ${target}, which does not say ${answer}: ${path}`);
      }),
    );
  });
}
