import { posix } from 'node:path';
import {
  type CheckoutFiles,
  isRecord,
  nameProject,
  parseJson,
  readProjectFiles,
} from '@puni/shared-checkout';
import type { Breach, Rule } from '../finding';

/** The JSON object at `path`, or `undefined` when it is absent or not a JSON object. */
function readObject(files: CheckoutFiles, path: string): Record<string, unknown> | undefined {
  if (!files.exists(path)) return undefined;
  const read = parseJson(files.readText(path));
  return 'value' in read && isRecord(read.value) ? read.value : undefined;
}

/** Every command string a target's options run: `command`, and each of `commands`. */
function listTargetCommands(target: unknown): string[] {
  if (!isRecord(target) || !isRecord(target['options'])) return [];
  const { command, commands } = target['options'];
  const listed: readonly unknown[] = Array.isArray(commands) ? commands : [];
  return [command, ...listed].flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    return isRecord(entry) && typeof entry['command'] === 'string' ? [entry['command']] : [];
  });
}

/** Whether a tsconfig `include` list takes in `src`. */
function includesSource(include: unknown): boolean {
  if (!Array.isArray(include)) return false;
  return include.some((entry) => typeof entry === 'string' && /^(\.\/)?src(\/|$)/u.test(entry));
}

/** The breaches of the project whose `project.json` is at `path`. */
function judgeProject(
  files: CheckoutFiles,
  path: string,
  name: string,
  project: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, unknown>>,
) {
  const directory = posix.dirname(path);
  const targets = isRecord(project['targets']) ? project['targets'] : {};
  const required = ['test', 'lint', 'typecheck'];
  if (project['projectType'] === 'application') required.push('build');
  const breaches: Breach[] = required
    .filter((target) => !Object.hasOwn(targets, target))
    .map((target) => ({
      path,
      message: `project ${name} has no ${target} target`,
      remedy: `add a ${target} target to ${path}, declared as the other projects declare theirs`,
    }));
  const tsconfig = posix.join(directory, 'tsconfig.json');
  if (!includesSource(readObject(files, tsconfig)?.['include'])) {
    breaches.push({
      path: tsconfig,
      message: `does not include src, so typecheck does not see project ${name}`,
      remedy: `make ${tsconfig} a JSON object whose include lists "src/**/*.ts"`,
    });
  }
  return [...breaches, ...judgeTimeouts(path, targets, defaults)];
}

/**
 * The breaches of every target of `targets` whose `bun test` lacks `--timeout`; a target that
 * declares no command runs the one `defaults` (the `targetDefaults` of `nx.json`) gives it.
 */
function judgeTimeouts(
  path: string,
  targets: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, unknown>>,
): Breach[] {
  return Object.entries(targets).flatMap(([target, declared]) => {
    const own = listTargetCommands(declared);
    const commands = own.length > 0 ? own : listTargetCommands(defaults[target]);
    return commands
      .filter((command) => command.includes('bun test') && !command.includes('--timeout'))
      .map(() => ({
        path,
        message: `target ${target} runs bun test without --timeout`,
        remedy: `add --timeout=20000 to the bun test command of target ${target}`,
      }));
  });
}

/**
 * Every project the scope owns but the root (which holds only the workspace checks) declares
 * `test`, `lint` and `typecheck` targets, and `build` when it is an application, and its
 * `tsconfig.json` includes `src`; every `bun test` any project runs, the root's included, its
 * own or the `nx.json` target default, carries `--timeout`. A `project.json` that names no
 * project is not a project.
 */
export const requireProjectTargets: Rule = {
  id: 'project.targets',
  since: 1,
  remedy:
    'give the project test, lint and typecheck targets (and build for an application), a tsconfig.json including src, and --timeout on every bun test',
  judge({ files, scope }) {
    const targetDefaults = readObject(files, 'nx.json')?.['targetDefaults'];
    const defaults = isRecord(targetDefaults) ? targetDefaults : {};
    return readProjectFiles(files, scope).flatMap((file) => {
      const name = nameProject(file);
      if (name === undefined || !('json' in file)) return [];
      if (file.path !== 'project.json') {
        return judgeProject(files, file.path, name, file.json, defaults);
      }
      const targets = file.json['targets'];
      return judgeTimeouts(file.path, isRecord(targets) ? targets : {}, defaults);
    });
  },
};
