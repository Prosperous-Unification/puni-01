import { posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { CheckoutFiles, WikiIndexResource } from './contract';
import { parseFrontMatter } from './front-matter';
import type { IndexSources, ReadWhenEntry, SourceDefect } from './index-sources';
import { ownsPath, repositoryScope } from './ownership';
import { judgeReadWhen } from './read-when';
import { indexDirectory } from './render-index';

type Reading = { readonly entry: ReadWhenEntry } | { readonly defect: SourceDefect };

function defectOf(path: string, message: string): Reading {
  return { defect: { topic: 'read-when', path, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBelowNodeModules(path: string): boolean {
  return path.split('/').includes('node_modules');
}

/**
 * Why `readFirst` cannot name the file to read first in the project at `directory`, or
 * `undefined` when it can: a relative path that stays inside the project and names an existing
 * regular file (not a symlink).
 */
function judgeReadFirst(
  files: CheckoutFiles,
  directory: string,
  readFirst: string,
): string | undefined {
  if (posix.isAbsolute(readFirst) || /^[A-Za-z]:|\\/u.test(readFirst)) {
    return 'must be a relative POSIX path';
  }
  const inside = posix.relative(directory, posix.join(directory, readFirst));
  if (inside === '' || inside === '..' || inside.startsWith('../')) {
    return 'must stay inside the project';
  }
  const kind = files.describe(posix.join(directory, inside));
  if (kind === 'absent') return 'names a missing file';
  return kind === 'file' ? undefined : 'must name a regular file';
}

/**
 * Reads one `project.json`: its `name`, `metadata.readWhen` and `metadata.readFirst`. Returns the
 * project's index entry, or one defect per invalid field.
 */
function readProject(files: CheckoutFiles, path: string): Reading[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(files.readText(path));
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return [defectOf(path, `is not valid JSON: ${cause.message}`)];
  }
  if (!isRecord(parsed)) return [defectOf(path, 'is not a JSON object')];
  const name = parsed['name'];
  if (typeof name !== 'string' || name === '') return [defectOf(path, 'has no name')];
  const metadata = isRecord(parsed['metadata']) ? parsed['metadata'] : {};
  const directory = posix.dirname(path);
  const defects: Reading[] = [];
  const readWhen = metadata['readWhen'];
  if (typeof readWhen !== 'string' || readWhen === '') {
    defects.push(defectOf(path, `project ${name} has no metadata.readWhen`));
  } else {
    const problem = judgeReadWhen(readWhen);
    if (problem !== undefined) {
      defects.push(defectOf(path, `project ${name} metadata.readWhen ${problem}`));
    }
  }
  const readFirst = metadata['readFirst'];
  const readFirstProblem =
    typeof readFirst !== 'string' || readFirst === ''
      ? 'is missing'
      : judgeReadFirst(files, directory, readFirst);
  if (readFirstProblem !== undefined) {
    const message = `project ${name} metadata.readFirst ${readFirstProblem}`;
    defects.push({ defect: { topic: 'read-first', path, message } });
  }
  if (defects.length > 0 || typeof readWhen !== 'string' || typeof readFirst !== 'string') {
    return defects;
  }
  return [{ entry: { name, path: posix.join(directory, readFirst), readWhen } }];
}

/**
 * The `title` and `read-when` of an authored page, from front matter that opens the file between
 * two `---` lines and holds one `key: value` per line.
 */
function readPage(path: string, text: string): Reading {
  const frontMatter = parseFrontMatter(text);
  if ('problem' in frontMatter) {
    return defectOf(
      path,
      frontMatter.problem === 'absent'
        ? 'does not begin with front matter'
        : `has a malformed front matter line: ${frontMatter.line}`,
    );
  }
  const fields = new Map(frontMatter.fields.map((field) => [field.key, field.value]));
  const title = fields.get('title');
  if (title === undefined || title === '') return defectOf(path, 'has no title');
  const readWhen = fields.get('read-when');
  if (readWhen === undefined || readWhen === '') {
    return defectOf(path, 'has no read-when');
  }
  const problem = judgeReadWhen(readWhen);
  if (problem !== undefined) return defectOf(path, `read-when ${problem}`);
  return { entry: { name: title, path, readWhen } };
}

function readSources(files: CheckoutFiles): IndexSources {
  const readings: Reading[] = [];
  const listing = files.listVisible(repositoryScope);
  const visible =
    'failure' in listing ? [] : listing.files.filter((path) => !isBelowNodeModules(path));
  if ('failure' in listing) readings.push(defectOf('.', listing.failure));
  for (const top of ['apps', 'libs']) {
    if (!files.exists(top)) {
      readings.push(defectOf(top, 'directory is missing'));
      continue;
    }
    for (const path of visible) {
      if (path.startsWith(`${top}/`) && posix.basename(path) === 'project.json') {
        readings.push(...readProject(files, path));
      }
    }
  }
  for (const path of visible) {
    if (!path.startsWith('wiki/') || !path.endsWith('.md')) continue;
    if (path.startsWith(`${indexDirectory}/`)) continue;
    readings.push(readPage(path, files.readText(path)));
  }
  return {
    entries: readings.flatMap((reading) => ('entry' in reading ? [reading.entry] : [])),
    defects: readings
      .flatMap((reading) => ('defect' in reading ? [reading.defect] : []))
      .sort((left, right) => compareBytes(left.path, right.path)),
  };
}

function listGenerated(files: CheckoutFiles): string[] {
  const listing = files.listVisible(repositoryScope);
  if ('failure' in listing) return [];
  return listing.files.filter((path) => path.startsWith(`${indexDirectory}/`));
}

/** The {@link WikiIndexResource}. */
export function createWikiIndex(): WikiIndexResource {
  return {
    readSources,
    readScopeDefects(files, scope) {
      if (scope.kind === 'repository' || scope.project.directory === '.') {
        return readSources(files).defects.filter((defect) => ownsPath(scope, defect.path));
      }
      const { directory } = scope.project;
      if (!/^(apps|libs)\//u.test(directory) || !files.exists(directory)) return [];
      const listing = files.listVisible(scope);
      if ('failure' in listing)
        return [{ topic: 'read-when', path: '.', message: listing.failure }];
      return listing.files
        .filter((path) => posix.basename(path) === 'project.json' && !isBelowNodeModules(path))
        .flatMap((path) => readProject(files, path))
        .flatMap((reading) => ('defect' in reading ? [reading.defect] : []));
    },
    compare(files, expected) {
      const present = listGenerated(files);
      const expectedPaths = [...expected.keys()].sort(compareBytes);
      return {
        missing: expectedPaths.filter((path) => !present.includes(path)),
        stale: expectedPaths.filter(
          (path) => present.includes(path) && files.readText(path) !== expected.get(path),
        ),
        unexpected: present.filter((path) => !expected.has(path)).sort(compareBytes),
      };
    },
    write(files, expected, drift) {
      for (const path of [...drift.missing, ...drift.stale]) {
        const content = expected.get(path);
        if (content === undefined) throw new Error(`${path} was compared but not rendered`);
        files.write(path, content);
      }
      for (const path of drift.unexpected) files.remove(path);
      files.removeEmptyDirectories(indexDirectory);
    },
  };
}
