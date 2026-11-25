import {
  formatMapCommand,
  generatedIndexDirectory,
  repositoryScope,
  indexWordBudget,
  judgePurposes,
  listPartitions,
  type MapLevel,
  type MapLineKind,
  type MapSources,
  readInvocation,
  readMapSources,
  readWhenRemedy,
  renderMapLevels,
  sectionRemedy,
  type SourceDefect,
} from '@puni/shared-checkout';
import type { Breach, Rule, RuleReading } from '../finding';

function readSources({ files, projectSources, registry }: RuleReading): MapSources {
  return readMapSources(files, projectSources, registry.rules);
}

/** The argument that prints `level`, `undefined` for the root. */
function argumentOf(level: MapLevel): string | undefined {
  if (level.kind === 'root') return undefined;
  return level.kind === 'section' ? level.section.directory : level.path;
}

/** What to do about `level` when its lines of `kind` hold the most of its words. */
function remedyFor(level: MapLevel, kind: MapLineKind | undefined, hints: string): string {
  const partition = level.kind === 'partition' ? level.path : '';
  switch (kind) {
    case 'projects':
      return `place some of its projects in a partition below ${partition} (${hints}) and give that partition a purpose in the map of puni.json, or shorten their read-when`;
    case 'children':
      return `shorten the purposes of the partitions below ${partition} in the map of puni.json, or group them under an intermediate partition`;
    case 'partitions':
      return 'shorten the purposes of the top-level partitions in the map of puni.json, or group them under fewer top-level partitions';
    case 'sections':
      return 'shorten the purposes of the wiki sections (wikiSections), or merge sections';
    case 'pages':
    case undefined:
      return level.kind === 'section'
        ? `shorten the read-when of the pages in wiki/${level.section.directory}/, or merge pages`
        : 'shorten the read-when of the pages directly in wiki/, merge them, or move them into a section';
  }
}

/**
 * Every level `puni burokrat wiki map` prints, the root, each wiki section and each partition,
 * stays within {@link indexWordBudget}, each judged alone. The root collapses its sections and a
 * partition its subtree when the whole does not fit, so a level over budget is one whose own
 * lines do not fit; the remedy follows the kind of line holding the most of its words. While
 * the sources have defects or a shown partition has no purpose the map cannot be printed; those
 * are the other `index` rules' findings.
 */
export const limitIndexWords: Rule = {
  id: 'index.words',
  since: 2,
  remedy: `shorten what the level lists until it prints at most ${String(indexWordBudget)} words`,
  judge(reading) {
    const sources = readSources(reading);
    const purposes = reading.registry.map;
    if (sources.defects.length > 0) return [];
    if (listPartitions(sources.projects).some((shown) => !purposes.has(shown))) return [];
    const invocation = readInvocation(reading.files);
    const hints = [...new Set(reading.projectSources.map((source) => source.placementHint))].join(
      '; ',
    );
    return renderMapLevels({ ...sources, purposes, invocation }).flatMap(
      ({ level, words, largest }): Breach[] => {
        if (words <= indexWordBudget) return [];
        const command = formatMapCommand(invocation, argumentOf(level));
        const what =
          level.kind === 'root'
            ? 'the root map'
            : level.kind === 'section'
              ? `the map of section ${level.section.directory}`
              : `the map of partition ${level.path}`;
        return [
          {
            path: level.kind === 'partition' ? 'puni.json' : 'wiki',
            message: `${what} (\`${command}\`) prints ${String(words)} words; at most ${String(indexWordBudget)}`,
            remedy: remedyFor(level, largest, hints),
          },
        ];
      },
    );
  },
};

/**
 * The `map` of `puni.json` gives the partitions the map shows purposes the map can print, as
 * `judgePurposes` judges them: each shown partition has one, each completes "Read this when …",
 * none is named as a wiki section, and none is for a partition no project is placed in. While
 * the sources have defects a project may be missing from them, so that last is judged only once
 * there are none.
 */
export const requirePurposes: Rule = {
  id: 'index.purpose',
  since: 2,
  remedy:
    'give each partition the map shows a purpose in the map of puni.json, a phrase completing "Read this when …", and remove each purpose of a partition no project is placed in',
  judge(reading) {
    const sources = readSources(reading);
    return judgePurposes(sources.projects, reading.registry.map, sources.defects.length === 0).map(
      ({ message, remedy }) => ({ path: 'puni.json', message, remedy }),
    );
  },
};

/** The index file AGENTS.md and README.md named before the map was printed. */
const generatedIndexFile = `${generatedIndexDirectory}/index.md`;

/**
 * From rules epoch 2 the map is printed, never committed: a `wiki/index/` an older puni generated
 * is a leftover, one finding however many files it holds.
 */
export const forbidGeneratedIndex: Rule = {
  id: 'index.leftover',
  since: 2,
  remedy: `run \`git rm -r ${generatedIndexDirectory}\`, then replace each \`${generatedIndexFile}\` in AGENTS.md and README.md with \`${formatMapCommand('puni')}\``,
  judge({ files }) {
    const left = files
      .listVisible(repositoryScope)
      .filter((path) => path.startsWith(`${generatedIndexDirectory}/`));
    if (left.length === 0) return [];
    return [
      {
        path: generatedIndexDirectory,
        message: `holds ${String(left.length)} ${left.length === 1 ? 'file' : 'files'} an older puni generated; \`${formatMapCommand('puni')}\` prints the map instead`,
      },
    ];
  },
};

/** The map source defects of `topic`, as findings, each with its source's remedy. */
function judgeSources(topic: SourceDefect['topic']): Rule['judge'] {
  return (reading) =>
    readSources(reading)
      .defects.filter((defect) => defect.topic === topic)
      .map(({ path, message, remedy }) => ({ path, message, remedy }));
}

/**
 * Every project has a valid "Read when" phrase and every page a valid `title` and `read-when`.
 * The root project judges every source: its check reads every project's files.
 */
export const requireReadWhen: Rule = {
  id: 'index.read-when',
  since: 1,
  remedy: readWhenRemedy,
  judge: judgeSources('read-when'),
};

/** Every project names a file to read first: a regular file inside the project. */
export const requireReadFirst: Rule = {
  id: 'index.read-first',
  since: 1,
  remedy: 'name a regular file inside the project as the file to read first',
  judge: judgeSources('read-first'),
};

/** Every project has a place in the map: the partition its project source gives it. */
export const requireScope: Rule = {
  id: 'index.scope',
  since: 1,
  remedy: 'give the project one partition of the map, as its project source says',
  judge: judgeSources('scope'),
};

/**
 * Every authored page lies directly in `wiki/` or in one of the sections `wikiSections` names, so
 * the map can list it under its section and a reader knows what kind of page it is.
 */
export const requireSection: Rule = {
  id: 'index.section',
  since: 1,
  remedy: sectionRemedy,
  judge: judgeSources('section'),
};
