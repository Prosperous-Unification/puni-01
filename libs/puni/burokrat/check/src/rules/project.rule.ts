import { posix } from 'node:path';
import type { CheckoutFiles } from '@puni/shared-checkout';
import { type Breach, breachListing, type Rule } from '../finding';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON object at `path`, or `undefined` when it is absent or not a JSON object. */
function readObject(files: CheckoutFiles, path: string): Record<string, unknown> | undefined {
  if (!files.exists(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(files.readText(path));
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
  return isRecord(parsed) ? parsed : undefined;
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

/** The breaches of the project whose `project.json` is at `path` and names `name`. */
function judgeProject(files: CheckoutFiles, path: string, project: Record<string, unknown>) {
  const name = String(project['name']);
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
  for (const [target, declared] of Object.entries(targets)) {
    for (const command of listTargetCommands(declared)) {
      if (command.includes('bun test') && !command.includes('--timeout')) {
        breaches.push({
          path,
          message: `target ${target} runs bun test without --timeout`,
          remedy: `add --timeout=20000 to the bun test command of target ${target}`,
        });
      }
    }
  }
  return breaches;
}

/**
 * Every project the scope owns but the root (which holds only the workspace checks) declares
 * `test`, `lint` and `typecheck` targets, and `build` when it is an application; its
 * `tsconfig.json` includes `src`; and every `bun test` it runs carries `--timeout`. A
 * `project.json` that names no project is not a project.
 */
export const requireProjectTargets: Rule = {
  id: 'project.targets',
  remedy:
    'give the project test, lint and typecheck targets (and build for an application), a tsconfig.json including src, and --timeout on every bun test',
  judge({ files, scope }) {
    const listing = files.listVisible(scope);
    if ('failure' in listing) return breachListing(listing.failure);
    return listing.files
      .filter((path) => posix.basename(path) === 'project.json' && path !== 'project.json')
      .filter((path) => !path.split('/').includes('node_modules'))
      .flatMap((path) => {
        const project = readObject(files, path);
        const name = project?.['name'];
        if (project === undefined || typeof name !== 'string' || name === '') return [];
        return judgeProject(files, path, project);
      });
  },
};
