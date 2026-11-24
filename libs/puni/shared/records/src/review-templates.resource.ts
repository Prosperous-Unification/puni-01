import { join } from 'node:path';
import { compareBytes, isRecord, parseJson, requireOnlyKeys } from '@puni/shared-checkout';
import { describeCause } from '@puni/shared-failures';
import type { FileSystem } from '@puni/shared-ports';
import type { ReviewTemplate, ReviewTemplateReference, ReviewTemplates } from './contract';
import { ReviewTemplateFailed } from './failures';
import { parseReviewCriteria } from './review-record';

const templateDirectory = 'puni-assessments';
const localTemplateId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const templateVersion = /^[1-9][0-9]*$/u;

const bundled: ReviewTemplate = {
  id: 'code-quality',
  version: '1',
  criteria: [
    {
      id: 'correctness',
      goal: 'Preserve the intended behavior across supported inputs and failure paths.',
    },
    {
      id: 'maintainability',
      goal: 'Make the behavior and ownership of the affected code clear to its maintainers.',
    },
    {
      id: 'verification',
      goal: 'Exercise the behavior that could regress through an ordinary entry point.',
    },
  ],
};

function failTemplate(reason: string, cause?: unknown): never {
  throw new ReviewTemplateFailed({
    details: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

function byVersion(left: ReviewTemplateReference, right: ReviewTemplateReference): number {
  return left.version.length - right.version.length || compareBytes(left.version, right.version);
}

/** Reads maps in `puni-assessments/<id>/<version>.json` alongside the built-in map. */
export function createReviewTemplates({
  fileSystem,
}: {
  readonly fileSystem: FileSystem;
}): ReviewTemplates {
  function readPath<Value>(path: string, read: () => Value): Value {
    try {
      return read();
    } catch (cause) {
      return failTemplate(`cannot read ${path}: ${describeCause(cause)}`, cause);
    }
  }

  function local(root: string): ReviewTemplateReference[] {
    const directory = join(root, templateDirectory);
    const kind = readPath(directory, () => fileSystem.stat(directory, 'no-follow'));
    if (kind === 'absent') return [];
    if (kind !== 'directory') failTemplate(`${templateDirectory} must be a directory`);
    return readPath(directory, () => fileSystem.list(directory)).flatMap((entry) => {
      if (!localTemplateId.test(entry.name)) return [];
      if (entry.kind !== 'directory')
        failTemplate(`${templateDirectory}/${entry.name} must be a directory`);
      const template = join(directory, entry.name);
      return readPath(template, () => fileSystem.list(template)).flatMap((file) => {
        if (!file.name.endsWith('.json')) return [];
        const version = file.name.slice(0, -5);
        if (!templateVersion.test(version) || file.kind !== 'file') {
          failTemplate(
            `${templateDirectory}/${entry.name}/${file.name} must be a regular JSON file named by a positive integer version`,
          );
        }
        if (entry.name === bundled.id && version === bundled.version) {
          failTemplate(`template ${entry.name}@${version} is already bundled with PUNI`);
        }
        return [{ id: entry.name, version }];
      });
    });
  }

  function list(root: string): ReviewTemplateReference[] {
    const { id, version } = bundled;
    return [{ id, version }, ...local(root)].sort(
      (left, right) => compareBytes(left.id, right.id) || byVersion(left, right),
    );
  }

  return {
    list,
    load(root, id, version) {
      const reference = list(root).findLast(
        (entry) => entry.id === id && (version === undefined || entry.version === version),
      );
      if (reference === undefined)
        failTemplate(
          `assessment template ${id}${version === undefined ? '' : `@${version}`} was not found`,
        );
      if (reference.id === bundled.id && reference.version === bundled.version) return bundled;
      const path = join(root, templateDirectory, reference.id, `${reference.version}.json`);
      const parsed = parseJson(readPath(path, () => fileSystem.readText(path)));
      if ('problem' in parsed) failTemplate(`${path} ${parsed.problem}`);
      const value = parsed.value;
      if (!isRecord(value)) failTemplate(`${path} must contain an object with criteria`);
      requireOnlyKeys(value, ['criteria'], path, failTemplate);
      try {
        return { ...reference, criteria: parseReviewCriteria(value['criteria']) };
      } catch (cause) {
        failTemplate(`${path}: ${describeCause(cause)}`, cause);
      }
    },
  };
}
