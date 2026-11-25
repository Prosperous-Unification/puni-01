import { posix } from 'node:path';
import { countWords, leavesRoot } from '@puni/shared-checkout';
import type { RecordFile } from './contract';
import { RecordDirectoryInvalid } from './failures';
import {
  optionalRecordKeys,
  recordDirectories,
  recordNamePattern,
  recordSummaryWordBudget,
  recordTopicLimit,
  requiredRecordKeys,
  slugPattern,
} from './records-schema';

/** Whether `text` is `YYYY-MM-DD` naming a day that exists in the Gregorian calendar. */
export function isCalendarDate(text: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (parts?.[1] === undefined || parts[2] === undefined || parts[3] === undefined) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Each record group (`nav`, `bur`) and the kind directories inside it.
 *
 * @throws RecordDirectoryInvalid when the module loads, if a kind directory is not `group/name`.
 */
export const groupDirectories = new Map<string, string[]>();
for (const directory of Object.values(recordDirectories)) {
  const [group, name] = directory.split('/');
  if (group === undefined || name === undefined) {
    throw new RecordDirectoryInvalid({ details: { directory } });
  }
  groupDirectories.set(group, [...(groupDirectories.get(group) ?? []), name]);
}

/** A front-matter key a record may hold. */
export type RecordKey = keyof typeof requiredRecordKeys | keyof typeof optionalRecordKeys;

/** Every record key with the form a finding states. */
export const recordKeyForms: Readonly<Record<RecordKey, string>> = {
  ...requiredRecordKeys,
  ...optionalRecordKeys,
};

/** Whether `key` is a record key. */
export function isRecordKey(key: string): key is RecordKey {
  return Object.hasOwn(recordKeyForms, key);
}

/**
 * Why `value` is not a valid `key` of the record `file`, or `undefined` when it is. A value
 * holding a line break is never valid: front matter holds one value per line. The document type
 * is judged by the `docs.type` rule, which knows every type, not here.
 */
export function judgeRecordValue(
  file: RecordFile,
  key: RecordKey,
  value: string,
): string | undefined {
  if (/[\r\n]/u.test(value)) return 'is not on one line';
  switch (key) {
    case 'kind':
      return value === file.kind ? undefined : `is ${value}`;
    case 'title':
      return value === '' ? 'is empty' : undefined;
    case 'date': {
      const named = recordNamePattern.exec(posix.basename(file.path))?.[1];
      if (named === undefined) return isCalendarDate(value) ? undefined : `is ${value}`;
      return value === named ? undefined : `is ${value}`;
    }
    case 'commit':
      return /^[0-9a-f]{7,40}$/u.test(value) ? undefined : `is ${value}`;
    case 'topics': {
      const topics = value.split(',').map((topic) => topic.trim());
      if (topics.length > recordTopicLimit) return `has ${String(topics.length)} entries`;
      const invalid = topics.filter((topic) => !slugPattern.test(topic));
      if (invalid.length > 0) return `has invalid entries ${JSON.stringify(invalid)}`;
      const duplicates = topics.filter((topic, index) => topics.indexOf(topic) !== index);
      return duplicates.length > 0 ? `repeats ${duplicates.join(', ')}` : undefined;
    }
    case 'summary': {
      if (value === '') return 'is empty';
      const words = countWords(value);
      return words > recordSummaryWordBudget ? `has ${String(words)} words` : undefined;
    }
    case 'puni-doc-type':
      return undefined;
    case 'supersedes':
    case 'superseded-by': {
      const normal = posix.normalize(value);
      const escapes = leavesRoot(normal) || posix.isAbsolute(value);
      return value === '' || escapes ? `is ${JSON.stringify(value)}` : undefined;
    }
  }
}

/** The whole record schema in one line, for a record that has no front matter. */
export function describeSchema(): string {
  const required = Object.entries(requiredRecordKeys).map(([key, form]) => `${key}: ${form}`);
  const optional = Object.entries(optionalRecordKeys).map(([key, form]) => `${key}: ${form}`);
  return `required keys: ${required.join('; ')}; optional keys: ${optional.join('; ')}`;
}
