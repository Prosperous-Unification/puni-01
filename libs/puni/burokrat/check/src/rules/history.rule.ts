import { nameRepository } from '@puni/shared-checkout';
import { isTypedDocumentation } from '../docs';
import type { Breach, Rule, RuleReading } from '../finding';

/** The ISO dates (`YYYY-MM-DD`) of the visible files the scope owns that `isJudged` chooses. */
function findDates({ files, scope }: RuleReading, isJudged: (path: string) => boolean): Breach[] {
  return files
    .listVisible(scope)
    .filter(isJudged)
    .flatMap((path) =>
      files
        .readText(path)
        .split('\n')
        .flatMap((line, index) =>
          [...line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map((date) => ({
            path,
            message: `line ${String(index + 1)} holds the date ${date[0]}`,
          })),
        ),
    );
}

const datesRemedy = 'say what is true now without the date; history belongs in a record';

/**
 * No ISO date (`YYYY-MM-DD`) in any visible `.md` file the scope owns. Epochs 1 to 3;
 * {@link forbidTypedDates} judges the documentation by its declared type.
 */
export const forbidDates: Rule = {
  id: 'history.date',
  since: 1,
  until: 4,
  remedy: datesRemedy,
  judge: (reading) => findDates(reading, (path) => path.endsWith('.md')),
};

/**
 * No ISO date in any visible Markdown file the scope owns whose declared type the documentation
 * rules judge: product documentation may date a release.
 */
export const forbidTypedDates: Rule = {
  id: 'history.date',
  since: 4,
  remedy: datesRemedy,
  judge: (reading) => findDates(reading, (path) => isTypedDocumentation(reading.files, path)),
};

/**
 * The records repository, the last URL segment of `system-records` in the registry, is named
 * only in `puni.json` and `AGENTS.md` (and `CLAUDE.md`, the same file). It judges the visible
 * files the scope owns, tracked or untracked and not ignored, so staging a file never changes the
 * result.
 */
export const confineRecordsName: Rule = {
  id: 'history.records',
  since: 1,
  remedy: 'remove the name; AGENTS.md alone says where the records live',
  judge({ files, registry, scope }) {
    const records = nameRepository(registry.repos['system-records']);
    const exempt: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'puni.json'];
    return files
      .listVisible(scope)
      .filter((path) => !exempt.includes(path))
      .filter((path) => files.readText(path).includes(records))
      .map((path) => ({ path, message: `names the records repository ${records}` }));
  },
};
