import { posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { SourceReader, SourceReading, SourceRegistry } from './contract';
import { SourceReadersOverlap } from './failures';

/** One remembered reading: what the reader read, or what it threw. */
type Remembered = { readonly reading: SourceReading } | { readonly failure: unknown };

/** `reader`, remembering what it read of each text and what its globals were, or what it threw. */
function remember(reader: SourceReader): SourceReader {
  const readings = new Map<string, Remembered>();
  let globals: { readonly names: ReadonlySet<string> } | { readonly failure: unknown } | undefined;
  return {
    extensions: reader.extensions,
    since: reader.since,
    read(text) {
      let known = readings.get(text);
      if (known === undefined) {
        try {
          known = { reading: reader.read(text) };
        } catch (caught) {
          known = { failure: caught };
        }
        readings.set(text, known);
      }
      if ('failure' in known) throw known.failure;
      return known.reading;
    },
    globals() {
      if (globals === undefined) {
        try {
          globals = { names: reader.globals() };
        } catch (caught) {
          globals = { failure: caught };
        }
      }
      if ('failure' in globals) throw globals.failure;
      return globals.names;
    },
  };
}

/**
 * The {@link SourceRegistry} of `readers` for one run: each reader picked by the extension of a
 * path's last segment, lower-cased, while its `since` reaches the epoch asked for; each text it
 * reads, and its globals, read once, a failure thrown again on every ask.
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
