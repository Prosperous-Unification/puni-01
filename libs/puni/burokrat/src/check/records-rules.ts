import { lstatSync, readFileSync, type Stats } from 'node:fs';
import { join, posix } from 'node:path';
import { countWords } from '../budgets';
import { type FrontMatterField, parseFrontMatter } from '../front-matter';
import {
  optionalRecordKeys,
  type RecordKind,
  recordDirectories,
  recordKinds,
  recordNamePattern,
  recordsTopLevel,
  recordSummaryWordBudget,
  recordTopicLimit,
  requiredRecordKeys,
  slugPattern,
} from '../records-schema';
import { compareBytes } from '../repository';
import type { Finding, RepositoryReading } from './finding';
import { type GitListing, listGitFiles } from './git-files';

/** A file in a kind directory, by repository path, with the kind its directory holds. */
interface RecordFile {
  readonly path: string;
  readonly kind: RecordKind;
}

function lstatOrAbsent(root: string, path: string): Stats | undefined {
  try {
    return lstatSync(join(root, path));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw cause;
  }
}

/**
 * The files the records rules judge: what `git ls-files --cached --others --exclude-standard`
 * lists (tracked, plus untracked files git does not ignore), less tracked files deleted from the
 * working tree, sorted by path. A git that cannot run or fails is a `failure`.
 */
function listVisibleFiles(root: string): GitListing {
  const listing = listGitFiles(root, ['--cached', '--others', '--exclude-standard']);
  if ('failure' in listing) return listing;
  return {
    files: listing.files
      .filter((path) => lstatOrAbsent(root, path) !== undefined)
      .sort(compareBytes),
  };
}

/** Every regular file directly inside a kind directory, among `files`. */
function listRecordFiles(root: string, files: readonly string[]): RecordFile[] {
  return files.flatMap((path) => {
    const kind = recordKinds.find(
      (candidate) => posix.dirname(path) === recordDirectories[candidate],
    );
    if (kind === undefined || lstatOrAbsent(root, path)?.isFile() !== true) return [];
    return [{ path, kind }];
  });
}

/**
 * Runs `judge` over the record files git shows, or reports the git failure as one `rule`
 * finding at the repository root.
 */
function judgeRecordFiles(
  root: string,
  rule: string,
  judge: (files: readonly string[]) => Finding[],
): Finding[] {
  const visible = listVisibleFiles(root);
  if ('failure' in visible) return [{ rule, path: '.', message: visible.failure }];
  return judge(visible.files);
}

/** Whether `text` is `YYYY-MM-DD` naming a day that exists in the Gregorian calendar. */
function isCalendarDate(text: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (parts?.[1] === undefined || parts[2] === undefined || parts[3] === undefined) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const groupDirectories = new Map<string, string[]>();
for (const directory of Object.values(recordDirectories)) {
  const [group, name] = directory.split('/');
  if (group === undefined || name === undefined) throw new Error(`${directory} is not group/name`);
  groupDirectories.set(group, [...(groupDirectories.get(group) ?? []), name]);
}

/**
 * The records layout, over the files git shows: only the names in {@link recordsTopLevel} at
 * the top level, only kind directories in `nav/` and `bur/`, and only regular files directly in a
 * kind directory. `dash/` is not inspected. Ignored files and empty directories are invisible.
 */
export function judgeRecordsLayout({ root }: RepositoryReading): Finding[] {
  const rule = 'records.layout';
  return judgeRecordFiles(root, rule, (files) => {
    const found = new Map<string, string>();
    const allowedTop = Object.keys(recordsTopLevel).join(', ');
    for (const path of files) {
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
      else if (lstatOrAbsent(root, path)?.isFile() !== true) found.set(path, message);
    }
    return [...found]
      .sort(([left], [right]) => compareBytes(left, right))
      .map(([path, message]) => ({ rule, path, message }));
  });
}

/** Every record file is named `YYYY-MM-DD-<slug>.md` with a real calendar date. */
export function judgeRecordNames({ root }: RepositoryReading): Finding[] {
  return judgeRecordFiles(root, 'records.name', (files) =>
    listRecordFiles(root, files).flatMap(({ path }) => {
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

type RecordKey = keyof typeof requiredRecordKeys | keyof typeof optionalRecordKeys;

const recordKeyForms: Readonly<Record<RecordKey, string>> = {
  ...requiredRecordKeys,
  ...optionalRecordKeys,
};

function isRecordKey(key: string): key is RecordKey {
  return Object.hasOwn(recordKeyForms, key);
}

/** Why `value` is not a valid `key` of the record `file`, or `undefined` when it is. */
function judgeRecordValue(file: RecordFile, key: RecordKey, value: string): string | undefined {
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
    case 'supersedes':
    case 'superseded-by': {
      const normal = posix.normalize(value);
      const escapes = normal === '..' || normal.startsWith('../') || posix.isAbsolute(value);
      return value === '' || escapes ? `is ${JSON.stringify(value)}` : undefined;
    }
  }
}

function describeSchema(): string {
  const required = Object.entries(requiredRecordKeys).map(([key, form]) => `${key}: ${form}`);
  const optional = Object.entries(optionalRecordKeys).map(([key, form]) => `${key}: ${form}`);
  return `required keys: ${required.join('; ')}; optional keys: ${optional.join('; ')}`;
}

/**
 * Every record file opens with front matter holding exactly the keys of
 * {@link requiredRecordKeys}, optionally those of {@link optionalRecordKeys}, each in its form.
 * A file without front matter gets one finding that states the whole schema.
 */
export function judgeRecordFrontMatter({ root }: RepositoryReading): Finding[] {
  const rule = 'records.front-matter';
  return judgeRecordFiles(root, rule, (files) =>
    listRecordFiles(root, files).flatMap((file) => {
      const frontMatter = parseFrontMatter(readFileSync(join(root, file.path), 'utf8'));
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

function readFields(root: string, path: string): readonly FrontMatterField[] | undefined {
  const frontMatter = parseFrontMatter(readFileSync(join(root, path), 'utf8'));
  return 'fields' in frontMatter ? frontMatter.fields : undefined;
}

const opposite = { supersedes: 'superseded-by', 'superseded-by': 'supersedes' } as const;

/**
 * Every `supersedes` and `superseded-by` names another existing record in a kind directory, and
 * the named record answers with the opposite key naming this one.
 */
export function judgeSupersession({ root }: RepositoryReading): Finding[] {
  const rule = 'records.supersession';
  return judgeRecordFiles(root, rule, (files) => {
    const records = listRecordFiles(root, files).map((file) => file.path);
    return records.flatMap((path) => {
      const fields = readFields(root, path) ?? [];
      return fields.flatMap(({ key, value }): Finding[] => {
        if (key !== 'supersedes' && key !== 'superseded-by') return [];
        const target = posix.normalize(value);
        const finding = (message: string): Finding[] => [{ rule, path, message }];
        if (target === path) return finding(`${key} names the record itself`);
        if (!records.includes(target)) {
          return finding(`${key} ${target} is not a record in a kind directory`);
        }
        const answer = opposite[key];
        const answered = (readFields(root, target) ?? []).some(
          (field) => field.key === answer && posix.normalize(field.value) === path,
        );
        return answered ? [] : finding(`${key} ${target}, which does not say ${answer}: ${path}`);
      });
    });
  });
}
