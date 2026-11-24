import { posix } from 'node:path';
import { compareBytes } from './byte-order';
import type { SourceReader, SourceRegistry } from './contract';
import { SourceReadersOverlap } from './failures';

/** `read`, remembering what it returned for each text. */
function rememberByText<T>(read: (text: string) => T): (text: string) => T {
  const made = new Map<string, T>();
  return (text) => {
    const known = made.get(text);
    if (known !== undefined) return known;
    const reading = read(text);
    made.set(text, reading);
    return reading;
  };
}

/**
 * The {@link SourceRegistry} of `readers` for one run: each reader picked by the extension of a
 * path's last segment, case and all, and each of its readings of a text made once.
 *
 * @throws SourceReadersOverlap when two readers claim one extension.
 */
export function openSourceRegistry(readers: readonly SourceReader[]): SourceRegistry {
  const byExtension = new Map<string, SourceReader>();
  for (const reader of readers) {
    const remembered: SourceReader = {
      extensions: reader.extensions,
      declarations: rememberByText((text) => reader.declarations(text)),
      docComments: rememberByText((text) => reader.docComments(text)),
      scope: rememberByText((text) => reader.scope(text)),
    };
    for (const extension of reader.extensions) {
      if (byExtension.has(extension)) throw new SourceReadersOverlap({ details: { extension } });
      byExtension.set(extension, remembered);
    }
  }
  return {
    extensions: [...byExtension.keys()].sort(compareBytes),
    readerOf: (path) => byExtension.get(posix.extname(path)),
  };
}
