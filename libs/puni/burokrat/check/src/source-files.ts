import {
  SourceReaderFailed,
  type SourceReading,
  SourceReadingFailed,
  SourceUnreadable,
} from '@puni/shared-checkout';
import type { RuleReading } from './finding';

/**
 * What the source reader of the repository's pin reads in the file at `path`, or why its text
 * cannot be read: `undefined` when no reader reads the file at the pin, else the reading, or the
 * reason of the `SourceUnreadable` its reader threw. Any other failure of the reader is no fault
 * of the file and propagates: a `SourceReaderFailed` as the `SourceReadingFailed` naming the
 * file, and anything else, as the `SourceReaderBroken` of a reader without its compiler, as
 * thrown.
 */
export function tryReadSourceFile(
  { files, sources, registry }: RuleReading,
  path: string,
): { readonly reading: SourceReading } | { readonly failure: string } | undefined {
  const reader = sources.readerOf(path, registry.rules);
  if (reader === undefined) return undefined;
  const text = files.readText(path);
  try {
    return { reading: reader.read(text) };
  } catch (caught) {
    if (caught instanceof SourceReaderFailed) {
      throw new SourceReadingFailed({ details: { path, ...caught.details }, cause: caught });
    }
    if (!(caught instanceof SourceUnreadable)) throw caught;
    return { failure: caught.message };
  }
}

/**
 * The reading of the file at `path` (see {@link tryReadSourceFile}), `undefined` when no reader
 * reads it at the pin or its text cannot be read: the `sources.read` rule names that failure, so
 * no other rule judges the file.
 */
export function readSourceFile(reading: RuleReading, path: string): SourceReading | undefined {
  const read = tryReadSourceFile(reading, path);
  return read !== undefined && 'reading' in read ? read.reading : undefined;
}
