import { posix } from 'node:path';
import {
  type CheckoutFiles,
  isRecord,
  judgeReadWhen,
  leavesRoot,
  type MapProject,
  nameProject,
  partitionSegmentPattern,
  type ProjectFile,
  type ProjectReading,
  type ProjectSource,
  readProjectFiles,
  readWhenRemedy,
  repositoryScope,
  type SourceDefect,
} from '@puni/shared-checkout';
import { readFirstRemedy, scopeRemedy } from './remedies';

type Reading = { readonly project: MapProject } | { readonly defect: SourceDefect };

/** The remedy of each defect topic a project can have. */
const remedies = {
  'read-when': readWhenRemedy,
  'read-first': readFirstRemedy,
  scope: scopeRemedy,
} as const;

function defectOf(topic: keyof typeof remedies, path: string, message: string): Reading {
  return { defect: { topic, path, message, remedy: remedies[topic] } };
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

/**
 * The index path of the project `name`, or why it has none. `metadata.index`, when present, is
 * the path: a non-empty array of {@link partitionSegmentPattern} segments. Else it is the one
 * segment `<name>` of the project's one `scope:<name>` tag; no tag, several, or a name the
 * pattern refuses is a problem.
 */
function readIndex(
  name: string,
  index: unknown,
  tags: unknown,
): { readonly index: readonly string[] } | { readonly problem: string } {
  if (index !== undefined) {
    const valid =
      Array.isArray(index) &&
      index.length > 0 &&
      index.every(
        (segment) => typeof segment === 'string' && partitionSegmentPattern.test(segment),
      );
    return valid
      ? { index: index.map(String) }
      : {
          problem: `project ${name} metadata.index must be a non-empty array of lower-case partition segments`,
        };
  }
  const listed: readonly unknown[] = Array.isArray(tags) ? tags : [];
  const scopes = listed.flatMap((tag) =>
    typeof tag === 'string' && tag.startsWith('scope:') ? [tag.slice('scope:'.length)] : [],
  );
  const [scope, ...others] = scopes;
  if (scope === undefined) return { problem: `project ${name} has no scope:<name> tag` };
  if (others.length > 0) {
    return { problem: `project ${name} has ${String(scopes.length)} scope tags; one is allowed` };
  }
  if (!partitionSegmentPattern.test(scope)) {
    return { problem: `project ${name} tag scope:${scope} cannot name a partition` };
  }
  return { index: [scope] };
}

/**
 * Reads one `project.json`: its `name`, `metadata.readWhen`, `metadata.readFirst` and index path
 * (see `readIndex`). Returns the project, or one defect per invalid field.
 */
function readProject(files: CheckoutFiles, file: ProjectFile): Reading[] {
  const { path, directory } = file;
  if ('problem' in file) return [defectOf('read-when', path, file.problem)];
  const name = nameProject(file);
  if (name === undefined) return [defectOf('read-when', path, 'has no name')];
  const metadata = isRecord(file.json['metadata']) ? file.json['metadata'] : {};
  const defects: Reading[] = [];
  const readWhen = metadata['readWhen'];
  if (typeof readWhen !== 'string' || readWhen === '') {
    defects.push(defectOf('read-when', path, `project ${name} has no metadata.readWhen`));
  } else {
    const problem = judgeReadWhen(readWhen);
    if (problem !== undefined) {
      defects.push(defectOf('read-when', path, `project ${name} metadata.readWhen ${problem}`));
    }
  }
  const readFirst = metadata['readFirst'];
  const readFirstProblem =
    typeof readFirst !== 'string' || readFirst === ''
      ? 'is missing'
      : judgeReadFirst(files, directory, readFirst);
  if (readFirstProblem !== undefined) {
    defects.push(
      defectOf('read-first', path, `project ${name} metadata.readFirst ${readFirstProblem}`),
    );
  }
  const index = readIndex(name, metadata['index'], file.json['tags']);
  if ('problem' in index) defects.push(defectOf('scope', path, index.problem));
  if (
    defects.length > 0 ||
    typeof readWhen !== 'string' ||
    typeof readFirst !== 'string' ||
    !('index' in index)
  ) {
    return defects;
  }
  const project = {
    name,
    root: directory,
    index: index.index,
    readWhen,
    readFirst: posix.join(directory, readFirst),
  };
  return [{ project }];
}

/**
 * The {@link ProjectSource} of an Nx workspace: every visible `project.json` under `apps/` and
 * `libs/`, not below `node_modules`, is a project, its place in the map its `metadata.index` or
 * else its scope tag (see `readIndex`). A workspace (a repository with `nx.json`) keeps its
 * projects there, so each of `apps/` and `libs/` it lacks is a defect; a repository without
 * `nx.json` holds no code and needs neither.
 */
export function createNxProjectSource(): ProjectSource {
  return {
    readProjects(files): ProjectReading {
      const readings: Reading[] = [];
      const projectFiles = readProjectFiles(files, repositoryScope);
      const isWorkspace = files.exists('nx.json');
      for (const top of ['apps', 'libs']) {
        if (!files.exists(top)) {
          if (isWorkspace) readings.push(defectOf('read-when', top, 'directory is missing'));
          continue;
        }
        for (const file of projectFiles) {
          if (file.path.startsWith(`${top}/`)) readings.push(...readProject(files, file));
        }
      }
      return {
        projects: readings.flatMap((reading) => ('project' in reading ? [reading.project] : [])),
        defects: readings.flatMap((reading) => ('defect' in reading ? [reading.defect] : [])),
      };
    },
  };
}
