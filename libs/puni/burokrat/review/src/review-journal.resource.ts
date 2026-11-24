import { isRecord, parseJson } from '@puni/shared-checkout';
import { describeCause } from '@puni/shared-failures';
import type { FileSystem } from '@puni/shared-ports';
import type { ReviewJournal } from './contract';
import { refuseReview, ReviewInputFailed } from './failures';
import { readReviewInput } from './review-input';

const version = 1;

function eventPath(path: string, index: number): string {
  return `${path}.${String(index + 1)}.json`;
}

/** Stores frozen inputs and result events in separate, create-only JSON files. */
export function createReviewJournal({
  fileSystem,
}: {
  readonly fileSystem: FileSystem;
}): ReviewJournal {
  function readPath<Value>(path: string, read: () => Value): Value {
    try {
      return read();
    } catch (cause) {
      throw new ReviewInputFailed({
        details: { reason: `cannot read ${path}: ${describeCause(cause)}` },
        cause,
      });
    }
  }

  function shape(path: string) {
    return readPath(path, () => fileSystem.stat(path, 'no-follow'));
  }

  function readInput(path: string): unknown {
    if (shape(path) !== 'file') {
      refuseReview(`${path} must be an existing regular file`);
    }
    const parsed = parseJson(readPath(path, () => fileSystem.readText(path)));
    if ('problem' in parsed) refuseReview(`${path} ${parsed.problem}`);
    return parsed.value;
  }

  function create(path: string, value: unknown): void {
    if (shape(path) !== 'absent') refuseReview(`${path} already exists`);
    const text = `${JSON.stringify(value)}\n`;
    try {
      fileSystem.writeNew(path, text);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') {
        refuseReview(`${path} already exists; read the current task before retrying`);
      }
      throw new ReviewInputFailed({
        details: { reason: `cannot write ${path}: ${describeCause(cause)}` },
        cause,
      });
    }
  }

  return {
    readInput,
    create(path, input) {
      if (shape(eventPath(path, 0)) !== 'absent') {
        refuseReview(`result files already exist for ${path}; use a new state path`);
      }
      create(path, { version, input });
    },
    read(path) {
      const value = readInput(path);
      if (!isRecord(value) || value['version'] !== version)
        refuseReview(`${path} has an unsupported review state version`);
      const input = readReviewInput(value['input']);
      const results: unknown[] = [];
      for (let index = 0; ; index++) {
        const event = eventPath(path, index);
        if (shape(event) === 'absent') return { input, results };
        results.push(readInput(event));
      }
    },
    append(path, index, response) {
      create(eventPath(path, index), response);
    },
  };
}
