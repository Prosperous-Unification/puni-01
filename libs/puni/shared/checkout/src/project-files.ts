import { posix } from 'node:path';
import type { CheckoutFiles } from './contract';
import { isRecord } from './json';
import type { CheckScope } from './ownership';

/** One visible `project.json`, in the project directory holding it: its JSON object, or why it holds none. */
export type ProjectFile = { readonly path: string; readonly directory: string } & (
  { readonly json: Readonly<Record<string, unknown>> } | { readonly problem: string }
);

/**
 * Every visible `project.json` that `scope` owns and that is not below `node_modules`, parsed,
 * sorted by path: the one reader of project files.
 */
export function readProjectFiles(files: CheckoutFiles, scope: CheckScope): ProjectFile[] {
  return files
    .listVisible(scope)
    .filter((path) => posix.basename(path) === 'project.json')
    .filter((path) => !path.split('/').includes('node_modules'))
    .map((path): ProjectFile => {
      const directory = posix.dirname(path);
      let parsed: unknown;
      try {
        parsed = JSON.parse(files.readText(path));
      } catch (cause) {
        if (!(cause instanceof SyntaxError)) throw cause;
        return { path, directory, problem: `is not valid JSON: ${cause.message}` };
      }
      return isRecord(parsed)
        ? { path, directory, json: parsed }
        : { path, directory, problem: 'is not a JSON object' };
    });
}

/** The project `file` names: its non-empty string `name`, else `undefined` (no project). */
export function nameProject(file: ProjectFile): string | undefined {
  if (!('json' in file)) return undefined;
  const name = file.json['name'];
  return typeof name === 'string' && name !== '' ? name : undefined;
}
