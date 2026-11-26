import type { Breach, Rule } from '../finding';
import { isGeneratedFile, readAttributes } from '../generated-files';
import { tryReadSourceFile } from '../source-files';

/**
 * Every visible file the scope owns that a source reader reads at the repository's pin, but for
 * what `.gitattributes` marks generated or vendored, has a text the reader can read: a file whose
 * text its parser gives up on is named here, once, and the other docs rules leave it unjudged,
 * so one file never stops the check. A reader that cannot read at all, as one without its
 * compiler, is no fault of any file: its failure stops the check once, named.
 */
export const judgeSourceReading: Rule = {
  id: 'sources.read',
  since: 3,
  remedy: 'make the file one its language parses, as the message says',
  judge(reading) {
    const attributes = readAttributes(reading.files);
    return reading.files.listVisible(reading.scope).flatMap((path): Breach[] => {
      if (isGeneratedFile(attributes, path)) return [];
      const read = tryReadSourceFile(reading, path);
      return read !== undefined && 'failure' in read
        ? [{ path, message: `cannot be read as source: ${read.failure}` }]
        : [];
    });
  },
};
