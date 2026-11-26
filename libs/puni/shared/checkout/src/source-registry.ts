import { posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { InstalledGlobals, SourceReader, SourceReading, SourceRegistry } from './contract';
import { SourceReadersOverlap } from './failures';

/** One remembered answer: what the reader gave, or what it threw. */
type Remembered<Value> = { readonly value: Value } | { readonly failure: unknown };

/** What `ask` gives, or throws, remembered in `known` under `key`, thrown again on every ask. */
function recall<Value>(
  known: Map<string, Remembered<Value>>,
  key: string,
  ask: () => Value,
): Value {
  let answer = known.get(key);
  if (answer === undefined) {
    try {
      answer = { value: ask() };
    } catch (caught) {
      answer = { failure: caught };
    }
    known.set(key, answer);
  }
  if ('failure' in answer) throw answer.failure;
  return answer.value;
}

/** `reader`, remembering what it read of each text and what its globals were for each root. */
function remember(reader: SourceReader): SourceReader {
  const readings = new Map<string, Remembered<SourceReading>>();
  const globals = new Map<string, Remembered<InstalledGlobals>>();
  return {
    extensions: reader.extensions,
    since: reader.since,
    read: (text) => recall(readings, text, () => reader.read(text)),
    globals: (root) => recall(globals, root, () => reader.globals(root)),
  };
}

/**
 * The {@link SourceRegistry} of `readers` for one run: each reader picked by the extension of a
 * path's last segment, lower-cased, while its `since` reaches the epoch asked for; each text it
 * reads, and its globals for each root, read once, a failure thrown again on every ask.
 *
 * @throws SourceReadersOverlap when two readers claim one extension.
 */
export function openSourceRegistry(readers: readonly SourceReader[]): SourceRegistry {
  const byExtension = new Map<string, SourceReader>();
  for (const reader of readers) {
    const remembered = remember(reader);
    for (const extension of reader.extensions.map((written) => written.toLowerCase())) {
      if (byExtension.has(extension)) throw new SourceReadersOverlap({ details: { extension } });
      byExtension.set(extension, remembered);
    }
  }
  return {
    extensions: (epoch) =>
      [...byExtension]
        .filter(([, reader]) => reader.since <= epoch)
        .map(([extension]) => extension)
        .sort(compareBytes),
    readerOf(path, epoch) {
      const reader = byExtension.get(posix.extname(path).toLowerCase());
      return reader !== undefined && reader.since <= epoch ? reader : undefined;
    },
  };
}
