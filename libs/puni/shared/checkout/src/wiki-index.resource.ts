import { posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { CheckoutFiles, WikiIndexResource } from './contract';
import { parseFrontMatter } from './front-matter';
import type { IndexDrift, IndexSources, ReadWhenEntry, SourceDefect } from './index-sources';
import { isRecord } from './json';
import { repositoryScope } from './ownership';
import { leavesRoot } from './paths';
import { nameProject, type ProjectFile, readProjectFiles } from './project-files';
import { judgeReadWhen } from './read-when';
import { indexDirectory } from './render-index';

type Reading = { readonly entry: ReadWhenEntry } | { readonly defect: SourceDefect };

function defectOf(path: string, message: string): Reading {
  return { defect: { topic: 'read-when', path, message } };
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
  if (inside === '' || leavesRoot(inside)) {
    return 'must stay inside the project';
  }
  const kind = files.describe(posix.join(directory, inside));
  if (kind === 'absent') return 'names a missing file';
  return kind === 'file' ? undefined : 'must name a regular file';
}

/** A partition name: it names the file `wiki/index/<name>.md`, so never `index`. */
const scopePattern = /^[a-z][a-z0-9-]*$/u;

/**
 * The `<name>` of the one `scope:<name>` tag of the project `name`, or why it has none: no tag,
 * several, or a name {@link scopePattern} refuses or that is `index`.
 */
function readScope(
  name: string,
  tags: unknown,
): { readonly scope: string } | { readonly problem: string } {
  const listed: readonly unknown[] = Array.isArray(tags) ? tags : [];
  const scopes = listed.flatMap((tag) =>
    typeof tag === 'string' && tag.startsWith('scope:') ? [tag.slice('scope:'.length)] : [],
  );
  const [scope, ...others] = scopes;
  if (scope === undefined) return { problem: `project ${name} has no scope:<name> tag` };
  if (others.length > 0) {
    return { problem: `project ${name} has ${String(scopes.length)} scope tags; one is allowed` };
  }
  if (!scopePattern.test(scope) || scope === 'index') {
    return { problem: `project ${name} tag scope:${scope} cannot name an index partition` };
  }
  return { scope };
}

/**
 * Reads one `project.json`: its `name`, `metadata.readWhen`, `metadata.readFirst` and scope tag.
 * Returns the project's index entry, or one defect per invalid field.
 */
function readProject(files: CheckoutFiles, file: ProjectFile): Reading[] {
  const { path, directory } = file;
  if ('problem' in file) return [defectOf(path, file.problem)];
  const name = nameProject(file);
  if (name === undefined) return [defectOf(path, 'has no name')];
  const metadata = isRecord(file.json['metadata']) ? file.json['metadata'] : {};
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
  const scope = readScope(name, file.json['tags']);
  if ('problem' in scope) {
    defects.push({ defect: { topic: 'scope', path, message: scope.problem } });
  }
  if (
    defects.length > 0 ||
    typeof readWhen !== 'string' ||
    typeof readFirst !== 'string' ||
    !('scope' in scope)
  ) {
    return defects;
  }
  const entryPath = posix.join(directory, readFirst);
  return [{ entry: { name, path: entryPath, readWhen, scope: scope.scope } }];
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

/**
 * The index sources of `files`. An Nx workspace (one with `nx.json`) keeps its projects under
 * `apps/` and `libs/`, so each missing one is a defect; a repository without `nx.json` holds no
 * code and needs neither.
 */
function readSources(files: CheckoutFiles): IndexSources {
  const readings: Reading[] = [];
  const projectFiles = readProjectFiles(files, repositoryScope);
  const isWorkspace = files.exists('nx.json');
  for (const top of ['apps', 'libs']) {
    if (!files.exists(top)) {
      if (!isWorkspace) continue;
      readings.push(defectOf(top, 'directory is missing'));
      continue;
    }
    for (const file of projectFiles) {
      if (file.path.startsWith(`${top}/`)) readings.push(...readProject(files, file));
    }
  }
  for (const path of files.listVisible(repositoryScope)) {
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

function compare(files: CheckoutFiles, expected: ReadonlyMap<string, string>): IndexDrift {
  const present = files
    .listVisible(repositoryScope)
    .filter((path) => path === indexDirectory || path.startsWith(`${indexDirectory}/`));
  const expectedPaths = [...expected.keys()].sort(compareBytes);
  return {
    missing: expectedPaths.filter((path) => !present.includes(path)),
    stale: expectedPaths.filter(
      (path) => present.includes(path) && files.readText(path) !== expected.get(path),
    ),
    unexpected: present.filter((path) => !expected.has(path)),
  };
}

/** The {@link WikiIndexResource}. */
export function createWikiIndex(): WikiIndexResource {
  return {
    readSources,
    compare,
    write(files, expected) {
      const drift = compare(files, expected);
      for (const path of drift.unexpected) files.remove(path);
      for (const [path, content] of expected) {
        if (drift.missing.includes(path) || drift.stale.includes(path)) files.write(path, content);
      }
      files.removeEmptyDirectories(indexDirectory);
      return drift;
    },
  };
}
