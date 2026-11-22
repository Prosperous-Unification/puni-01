import { posix } from 'node:path';
import { compareBytes } from '@puni/shared-checkout';
import {
  discoverValidateAndCaptureDag,
  materializeMultiEntryDagInputFromRecordCatalog,
} from 'configurable-tree-traversal';
import {
  type RecordFile,
  recordNamePattern,
  recordsTopLevel,
  requiredRecordKeys,
} from '@puni/shared-records';
import { type Breach, breachListing, type Rule, type RuleReading } from '../finding';
import {
  describeSchema,
  groupDirectories,
  isCalendarDate,
  isRecordKey,
  judgeRecordValue,
  recordKeyForms,
} from '../record-values';

/** Runs `judge` over the visible record files, or reports the git failure as one breach. */
function judgeRecordFiles(
  { files, records }: RuleReading,
  judge: (recordFiles: readonly RecordFile[]) => Breach[],
): Breach[] {
  const listing = records.list(files);
  if ('failure' in listing) return breachListing(listing.failure);
  return judge(listing.records);
}

/**
 * The records layout, over the paths git shows: only the names in {@link recordsTopLevel} at the
 * top level, only kind directories in `nav/` and `bur/`, and only regular files directly in a
 * kind directory. `dash/` is not inspected. Ignored files and empty directories are invisible.
 */
export const judgeRecordsLayout: Rule = {
  id: 'records.layout',
  remedy: 'move or remove it; the records AGENTS.md says where each kind of record goes',
  judge: ({ files }) => judgeLayout(files.listVisibleEntries()),
};

function judgeLayout(listing: ReturnType<RuleReading['files']['listVisibleEntries']>): Breach[] {
  if ('failure' in listing) return breachListing(listing.failure);
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
    .map(([path, message]) => ({ path, message }));
}

/** Every record file is named `YYYY-MM-DD-<slug>.md` with a real calendar date. */
export const judgeRecordNames: Rule = {
  id: 'records.name',
  remedy: 'rename it YYYY-MM-DD-<slug>.md with git mv, and keep its date key equal to that day',
  judge: (reading) =>
    judgeRecordFiles(reading, (recordFiles) =>
      recordFiles.flatMap(({ path }) => {
        const name = recordNamePattern.exec(posix.basename(path));
        if (name?.[1] !== undefined && isCalendarDate(name[1])) return [];
        return [
          {
            path,
            message:
              'must be named YYYY-MM-DD-<slug>.md: a real calendar date, then lower-case letters and digits joined by single hyphens',
          },
        ];
      }),
    ),
};

/**
 * Every record file opens with front matter holding exactly the keys of
 * {@link requiredRecordKeys}, optionally those of the optional record keys, each in its form. A
 * file without front matter gets one finding that states the whole schema.
 */
export const judgeRecordFrontMatter: Rule = {
  id: 'records.front-matter',
  remedy: 'correct the front matter as the message says',
  judge: judgeFrontMatter,
};

function judgeFrontMatter(reading: RuleReading): Breach[] {
  const { files, records } = reading;
  return judgeRecordFiles(reading, (recordFiles) =>
    recordFiles.flatMap((file) => {
      const frontMatter = records.readFrontMatter(files, file.path);
      const finding = (message: string): Breach => ({ path: file.path, message });
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
      const findings: Breach[] = [];
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

type SupersessionKey = keyof typeof opposite;

function isSupersessionKey(key: string): key is SupersessionKey {
  return Object.hasOwn(opposite, key);
}

/** Each record's supersession fields as `{ key, target }`, the target normalised. */
function readSupersessions(
  reading: RuleReading,
  paths: readonly string[],
): Map<string, { readonly key: SupersessionKey; readonly target: string }[]> {
  const { files, records } = reading;
  return new Map(
    paths.map((path) => {
      const frontMatter = records.readFrontMatter(files, path);
      const fields = 'fields' in frontMatter ? frontMatter.fields : [];
      return [
        path,
        fields.flatMap(({ key, value }) =>
          isSupersessionKey(key) ? [{ key, target: posix.normalize(value) }] : [],
        ),
      ];
    }),
  );
}

/**
 * The cycles of the supersession graph, each as its records sorted: a record waits for every
 * record it supersedes and for every record naming it in `superseded-by`, and a cycle is a
 * strongly connected set that can never be ordered. Targets that are not records are left out;
 * they are breaches of their own.
 */
function findSupersessionCycles(
  supersessions: ReadonlyMap<string, readonly { key: SupersessionKey; target: string }[]>,
): string[][] {
  const older = new Map<string, Set<string>>(
    [...supersessions.keys()].map((path) => [path, new Set()]),
  );
  for (const [path, fields] of supersessions) {
    for (const { key, target } of fields) {
      if (target === path || !supersessions.has(target)) continue;
      if (key === 'supersedes') older.get(path)?.add(target);
      else older.get(target)?.add(path);
    }
  }
  const prepared = discoverValidateAndCaptureDag(
    materializeMultiEntryDagInputFromRecordCatalog([...older], {
      selectVertexId: ([path]) => path,
      selectWorkPrerequisiteVertexIds: ([, prerequisites]) => prerequisites,
    }),
  );
  if (prepared.kind === 'valid') return [];
  return prepared.issues.flatMap((issue) =>
    issue.kind === 'milestoneDependencyStall'
      ? issue.diagnostics.milestoneCycleVertexIdComponents.map((component) =>
          component.filter((path) => typeof path === 'string').sort(compareBytes),
        )
      : [],
  );
}

/**
 * Every `supersedes` and `superseded-by` names another existing record in a kind directory, the
 * named record answers with the opposite key naming this one, and no chain of supersessions
 * returns to where it started.
 */
export const judgeSupersession: Rule = {
  id: 'records.supersession',
  remedy:
    'make the newer record say supersedes and the older say superseded-by, each naming the other',
  judge: (reading) =>
    judgeRecordFiles(reading, (recordFiles) => {
      const paths = recordFiles.map((file) => file.path);
      const supersessions = readSupersessions(reading, paths);
      const pairs = paths.flatMap((path) =>
        (supersessions.get(path) ?? []).flatMap(({ key, target }): Breach[] => {
          const finding = (message: string): Breach[] => [{ path, message }];
          if (target === path) return finding(`${key} names the record itself`);
          if (!paths.includes(target)) {
            return finding(`${key} ${target} is not a record in a kind directory`);
          }
          const answer = opposite[key];
          const answered = (supersessions.get(target) ?? []).some(
            (field) => field.key === answer && field.target === path,
          );
          return answered ? [] : finding(`${key} ${target}, which does not say ${answer}: ${path}`);
        }),
      );
      const cycles = findSupersessionCycles(supersessions).map((cycle) => ({
        path: cycle[0] ?? '.',
        message: `is in a supersession cycle: ${cycle.join(' → ')}`,
        remedy: 'break the cycle: a record supersedes only records older than itself',
      }));
      return [...pairs, ...cycles];
    }),
};
