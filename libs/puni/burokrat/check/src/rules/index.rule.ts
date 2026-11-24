import {
  countWords,
  formatMapCommand,
  indexWordBudget,
  judgePurposes,
  judgeReadWhen,
  type MapSources,
  readInvocation,
  readMapSources,
  readWhenRemedy,
  renderMapLevels,
  sectionRemedy,
  type SourceDefect,
} from '@puni/shared-checkout';
import type { Breach, Rule, RuleReading } from '../finding';

function readSources({ files, projectSources }: RuleReading): MapSources {
  return readMapSources(files, projectSources);
}

/**
 * Every level `puni burokrat wiki map` prints, the root and each partition, stays within
 * {@link indexWordBudget}, each judged alone. A partition prints its whole subtree only when that
 * fits, so a level over budget is the root, or a partition whose own projects and child
 * partitions do not fit. While the sources have defects or a partition lacks its purpose the map
 * cannot be printed; those are the other `index` rules' findings.
 */
export const limitIndexWords: Rule = {
  id: 'index.words',
  since: 2,
  remedy: `shorten what the level lists until it prints at most ${String(indexWordBudget)} words`,
  judge(reading) {
    const sources = readSources(reading);
    const purposes = reading.registry.map;
    if (sources.defects.length > 0) return [];
    if (judgePurposes(sources.projects, purposes).missing.length > 0) return [];
    const invocation = readInvocation(reading.files);
    const levels = renderMapLevels({ ...sources, purposes, invocation });
    return levels.flatMap(({ partition, text }): Breach[] => {
      const words = countWords(text);
      if (words <= indexWordBudget) return [];
      const counted = `prints ${String(words)} words; at most ${String(indexWordBudget)}`;
      const command = formatMapCommand(invocation, partition);
      return partition === undefined
        ? [
            {
              path: 'wiki',
              message: `the root map (\`${command}\`) ${counted}`,
              remedy:
                'shorten the read-when of the wiki pages and the purposes of the top-level partitions in the map of puni.json, or merge pages',
            },
          ]
        : [
            {
              path: 'puni.json',
              message: `the map of partition ${partition} (\`${command}\`) ${counted}`,
              remedy: `place some of its projects in a partition below ${partition} (metadata.index in an Nx project.json) and give that partition a purpose in the map of puni.json, or shorten their read-when`,
            },
          ];
    });
  },
};

/**
 * The `map` of `puni.json` gives a purpose to exactly the partitions the map shows, each a phrase
 * completing "Read this when …". While the sources have defects a project may be missing from
 * them, so a purpose no project uses is judged only once there are none.
 */
export const requirePurposes: Rule = {
  id: 'index.purpose',
  since: 2,
  remedy:
    'give each partition the map shows a purpose in the map of puni.json, a phrase completing "Read this when …", and remove each purpose of a partition no project is placed in',
  judge(reading) {
    const sources = readSources(reading);
    const purposes = reading.registry.map;
    const path = 'puni.json';
    const { missing, unused } = judgePurposes(sources.projects, purposes);
    const breaches: Breach[] = missing.map((partition) => ({
      path,
      message: `map has no purpose for partition ${partition}, which the map shows`,
      remedy: `add "${partition}": "<the task an agent comes to ${partition} for>" to the map of puni.json`,
    }));
    if (sources.defects.length === 0) {
      for (const partition of unused) {
        breaches.push({
          path,
          message: `map gives a purpose for partition ${partition}, where no project is placed`,
          remedy: `remove "${partition}" from the map of puni.json, or place a project there`,
        });
      }
    }
    for (const [partition, purpose] of purposes) {
      const problem = judgeReadWhen(purpose);
      if (problem !== undefined) {
        breaches.push({
          path,
          message: `map.${partition} ${problem}`,
          remedy: `make the purpose of ${partition} a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words`,
        });
      }
    }
    return breaches;
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
 * The root project judges every source: its check reads every `project.json`.
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
