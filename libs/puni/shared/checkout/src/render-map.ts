import { compareBytes } from './byte-order';
import type { CheckoutFiles } from './contract';
import { isRecord, parseJson } from './json';
import type { MapPage, MapProject } from './map-sources';
import { placePage, wikiSections } from './wiki-sections';
import { countWords } from './word-count';

/**
 * The most whitespace-separated words one printed level of the map may hold: the root, or one
 * partition. A partition prints its whole subtree only within it.
 */
export const indexWordBudget = 400;

/** What the map is rendered from. */
export interface MapContent {
  readonly pages: readonly MapPage[];
  readonly projects: readonly MapProject[];
  /** The purpose of each partition, a phrase completing "Read this when …", by partition path. */
  readonly purposes: ReadonlyMap<string, string>;
  /** The words that run `puni` in the repository, as {@link readInvocation} gives them. */
  readonly invocation: string;
}

/**
 * The words that run `puni` in the repository of `files`: `bun run puni` when its root
 * `package.json` has a `puni` script, as a repository holding the CLI's source does, else `puni`,
 * the installed program.
 */
export function readInvocation(files: CheckoutFiles): string {
  if (!files.exists('package.json')) return 'puni';
  const read = parseJson(files.readText('package.json'));
  const scripts = 'value' in read && isRecord(read.value) ? read.value['scripts'] : undefined;
  return isRecord(scripts) && typeof scripts['puni'] === 'string' ? 'bun run puni' : 'puni';
}

/** The command printing the map's root, or with `partition` that partition. */
export function formatMapCommand(invocation: string, partition?: string): string {
  const command = `${invocation} burokrat wiki map`;
  return partition === undefined ? command : `${command} ${partition}`;
}

/** The partition path of `project`: its index segments joined by `/`. */
export function placeProject(project: MapProject): string {
  return project.index.join('/');
}

/**
 * Every partition the map shows: each project's partition and every partition above it, sorted
 * bytewise, so a partition comes right before its subtree.
 */
export function listPartitions(projects: readonly MapProject[]): string[] {
  const partitions = new Set<string>();
  for (const project of projects) {
    for (const [index] of project.index.entries()) {
      partitions.add(project.index.slice(0, index + 1).join('/'));
    }
  }
  return [...partitions].sort(compareBytes);
}

/**
 * The partitions the map shows without a purpose in `purposes` (`missing`), and those with one
 * the map does not show (`unused`), each sorted bytewise.
 */
export function judgePurposes(
  projects: readonly MapProject[],
  purposes: ReadonlyMap<string, string>,
): { readonly missing: readonly string[]; readonly unused: readonly string[] } {
  const shown = listPartitions(projects);
  return {
    missing: shown.filter((partition) => !purposes.has(partition)),
    unused: [...purposes.keys()]
      .filter((partition) => !shown.includes(partition))
      .sort(compareBytes),
  };
}

/** A `## heading` and its lines, then a blank line; nothing when there are no lines. */
function renderSection(heading: string, lines: readonly string[], level = '##'): string[] {
  return lines.length === 0 ? [] : [`${level} ${heading}`, '', ...lines, ''];
}

/** `purpose` as a sentence: its first letter upper-case, ending in a full stop. */
function describe(purpose: string): string {
  return `${purpose.charAt(0).toUpperCase()}${purpose.slice(1)}.`;
}

function listReadWhen(entries: readonly { name: string; path: string; readWhen: string }[]) {
  return entries
    .map((entry) => `- ${entry.readWhen}: [${entry.name}](${entry.path})`)
    .sort(compareBytes);
}

/**
 * The pages' "Read when": those at the wiki root, then one `###` subsection per
 * {@link wikiSections} entry in its order, saying what its pages are for and listing them; a
 * section without pages is left out, and the whole is nothing when there are no pages.
 *
 * @throws Error when a page lies outside the wiki root and every section, which reading the
 *   sources reports as a `section` defect instead.
 */
function renderPages(pages: readonly MapPage[]): string[] {
  const places = pages.map((page) => {
    const place = placePage(page.path);
    if (place.kind === 'unplaced') {
      throw new Error(`${page.path} lies in no section; readMapSources reports it as a defect`);
    }
    return { page, directory: place.kind === 'section' ? place.section.directory : undefined };
  });
  const inSection = (directory: string | undefined) =>
    places.filter((place) => place.directory === directory).map(({ page }) => page);
  const subsections = wikiSections.flatMap(({ directory, heading, purpose }) => {
    const lines = listReadWhen(inSection(directory));
    return renderSection(
      heading,
      lines.length === 0 ? [] : [describe(purpose), '', ...lines],
      '###',
    );
  });
  const root = listReadWhen(inSection(undefined));
  if (root.length === 0 && subsections.length === 0) return [];
  return ['## Read when', '', ...(root.length === 0 ? [] : [...root, '']), ...subsections];
}

/**
 * The purpose of `partition`.
 *
 * @throws Error when it has none; a caller judges the purposes with {@link judgePurposes} first.
 */
function purposeOf(content: MapContent, partition: string): string {
  const purpose = content.purposes.get(partition);
  if (purpose === undefined) {
    throw new Error(`partition ${partition} has no purpose; judgePurposes reports it`);
  }
  return purpose;
}

/** One line per partition of `partitions`, in their order: its purpose and its command. */
function listPartitionLines(content: MapContent, partitions: readonly string[]): string[] {
  return partitions.map(
    (partition) =>
      `- ${purposeOf(content, partition)}: \`${formatMapCommand(content.invocation, partition)}\``,
  );
}

function listProjectLines(content: MapContent, partition: string): string[] {
  return listReadWhen(
    content.projects
      .filter((project) => placeProject(project) === partition)
      .map(({ name, readFirst, readWhen }) => ({ name, path: readFirst, readWhen })),
  );
}

/** The partitions one level below `parent`, the root when it is `undefined`. */
function listChildren(content: MapContent, parent: string | undefined): string[] {
  return listPartitions(content.projects).filter((partition) => {
    const cut = partition.lastIndexOf('/');
    return cut === -1 ? parent === undefined : partition.slice(0, cut) === parent;
  });
}

/**
 * The root of the map: the pages' "Read when" (see `renderPages`), then each top-level partition
 * with its purpose and the command that prints it. Links are repository-root-relative paths; the
 * text has LF endings and carries no dates or absolute paths.
 */
export function renderRootMap(content: MapContent): string {
  return [
    '# Wiki map',
    '',
    ...renderPages(content.pages),
    ...renderSection('Partitions', listPartitionLines(content, listChildren(content, undefined))),
  ].join('\n');
}

/**
 * The map of `partition`: its purpose, the "Read when" line of each project placed in it, linking
 * its file to read first, then its whole subtree, one section per partition below it, when that
 * fits {@link indexWordBudget}; otherwise only the partitions one level below, each with its
 * purpose and the command that prints it. A level over the budget is then one whose own projects
 * and child partitions do not fit, which only placing projects deeper can fix.
 *
 * @throws Error when `partition` is not one {@link listPartitions} gives.
 */
export function renderPartitionMap(content: MapContent, partition: string): string {
  if (!listPartitions(content.projects).includes(partition)) {
    throw new Error(`the map shows no partition ${partition}`);
  }
  const head = [
    `# Wiki map: ${partition}`,
    '',
    `Read this when ${purposeOf(content, partition)}.`,
    '',
    ...renderSection('Read when', listProjectLines(content, partition)),
  ];
  const subtree = listPartitions(content.projects).filter((below) =>
    below.startsWith(`${partition}/`),
  );
  const whole = [
    ...head,
    ...subtree.flatMap((below) => [
      `## ${below}`,
      '',
      `Read this when ${purposeOf(content, below)}.`,
      '',
      ...listProjectLines(content, below).flatMap((line, index, lines) =>
        index === lines.length - 1 ? [line, ''] : [line],
      ),
    ]),
  ].join('\n');
  if (countWords(whole) <= indexWordBudget) return whole;
  return [
    ...head,
    ...renderSection('Partitions', listPartitionLines(content, listChildren(content, partition))),
  ].join('\n');
}

/** Every level the map prints, the root (`partition` undefined) first, then each partition. */
export function renderMapLevels(
  content: MapContent,
): { readonly partition: string | undefined; readonly text: string }[] {
  return [
    { partition: undefined, text: renderRootMap(content) },
    ...listPartitions(content.projects).map((partition) => ({
      partition,
      text: renderPartitionMap(content, partition),
    })),
  ];
}
