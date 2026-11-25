import type { Breach, Rule } from '../finding';
import { tryReadSourceFile } from '../source-files';

/**
 * Every visible file the scope owns that a source reader reads at the repository's pin can be
 * read by it: a file it cannot is named here, once, and the other docs rules leave it unjudged,
 * so one file never stops the check.
 */
export const judgeSourceReading: Rule = {
  id: 'sources.read',
  since: 3,
  remedy: 'make the file one its language parses, as the message says',
  judge: (reading) =>
    reading.files.listVisible(reading.scope).flatMap((path): Breach[] => {
      const read = tryReadSourceFile(reading, path);
      return read !== undefined && 'failure' in read
        ? [{ path, message: `cannot be read as source: ${read.failure}` }]
        : [];
    }),
};
