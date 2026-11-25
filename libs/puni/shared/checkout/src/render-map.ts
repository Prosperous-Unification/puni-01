import { compareBytes } from './byte-order';
import type { CheckoutFiles } from './contract';
import { isRecord, parseJson } from './json';
import type { MapPage, MapProject } from './map-sources';
import { judgeReadWhen } from './read-when';
import { placePage, type WikiSection, wikiSections } from './wiki-sections';
import { countWords } from './word-count';

/**
 * The most whitespace-separated words one printed level of the map may hold: the root, one wiki
 * section or one partition.
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
 * One level `puni burokrat wiki map` prints: the root (no argument), a wiki section (its
 * directory as the argument) or a partition (its path as the argument). Sections and partitions
 * share the one argument, so no partition may be named as a section directory.
 */
export type MapLevel =
  | { readonly kind: 'root' }
  | { readonly kind: 'section'; readonly section: WikiSection }
  | { readonly kind: 'partition'; readonly path: string };

/**
 * What the lines of a printed level list: wiki pages, collapsed wiki sections, top-level
 * partitions (on the root), the projects placed in the level, or the partitions one level below
 * it.
 */
export type MapLineKind = 'pages' | 'sections' | 'partitions' | 'projects' | 'children';

/** A printed level: its text, its words, and the kind of line that holds the most of them. */
export interface RenderedLevel {
  readonly level: MapLevel;
  readonly text: string;
  readonly words: number;
  /** The kind of line holding the most words, `undefined` when the level lists nothing. */
  readonly largest: MapLineKind | undefined;
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

/** The command printing the map's root, or with `argument` that section or partition. */
export function formatMapCommand(invocation: string, argument?: string): string {
  const command = `${invocation} burokrat wiki map`;
  return argument === undefined ? command : `${command} ${argument}`;
}

/** The partition path of `project`: its index segments joined by `/`. */
export function placeProject(project: MapProject): string {
  return project.index.join('/');
}

/**
 * Orders partition paths segment by segment, each segment bytewise, so a partition comes right
 * before its subtree: `a`, `a/b`, `a/b/d`, `a/b-c`, `a-b`.
 */
export function comparePartitions(left: string, right: string): number {
  const lefts = left.split('/');
  const rights = right.split('/');
  for (let at = 0; at < Math.min(lefts.length, rights.length); at += 1) {
    const order = compareBytes(lefts[at] ?? '', rights[at] ?? '');
    if (order !== 0) return order;
  }
  return lefts.length - rights.length;
}

/**
 * Every partition the map shows: each project's partition and every partition above it, in
 * {@link comparePartitions} order.
 */
export function listPartitions(projects: readonly MapProject[]): string[] {
  const partitions = new Set<string>();
  for (const project of projects) {
    for (const [index] of project.index.entries()) {
      partitions.add(project.index.slice(0, index + 1).join('/'));
    }
  }
  return [...partitions].sort(comparePartitions);
}

/** The wiki sections that hold at least one of `pages`, in {@link wikiSections} order. */
export function listSections(pages: readonly MapPage[]): WikiSection[] {
  return wikiSections.filter((section) => pages.some((page) => sectionOf(page) === section));
}

/** One reason the map cannot be printed from its purposes, on the `map` of `puni.json`. */
export interface PurposeProblem {
  readonly partition: string;
  readonly message: string;
  readonly remedy: string;
}

/**
 * Every reason the purposes of the `map` of `puni.json` do not fit `projects`: a partition the map
 * shows without a purpose; a purpose that does not complete "Read this when …"
 * ({@link judgeReadWhen}); a top-level partition named as a wiki section directory, which the
 * one map argument cannot tell from that section; and, unless `projectsComplete` is false (the
 * sources had defects, so a project may be missing), a purpose for a partition no project is
 * placed in. Sorted by partition.
 */
export function judgePurposes(
  projects: readonly MapProject[],
  purposes: ReadonlyMap<string, string>,
  projectsComplete = true,
): PurposeProblem[] {
  const shown = listPartitions(projects);
  const problems: PurposeProblem[] = [];
  for (const partition of shown) {
    if (!purposes.has(partition)) {
      problems.push({
        partition,
        message: `map has no purpose for partition ${partition}, which the map shows`,
        remedy: `add "${partition}": "<the task an agent comes to ${partition} for>" to the map of puni.json`,
      });
    }
    const section = wikiSections.find(({ directory }) => directory === partition);
    if (section !== undefined) {
      problems.push({
        partition,
        message: `partition ${partition} has the name of the wiki section wiki/${partition}/, which \`wiki map ${partition}\` prints`,
        remedy: `place the projects of ${partition} in a partition of another name`,
      });
    }
  }
  for (const [partition, purpose] of purposes) {
    if (projectsComplete && !shown.includes(partition)) {
      problems.push({
        partition,
        message: `map gives a purpose for partition ${partition}, where no project is placed`,
        remedy: `remove "${partition}" from the map of puni.json, or place a project there`,
      });
    }
    const problem = judgeReadWhen(purpose);
    if (problem !== undefined) {
      problems.push({
        partition,
        message: `map.${partition} ${problem}`,
        remedy: `make the purpose of ${partition} a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words`,
      });
    }
  }
  return problems.sort((left, right) => comparePartitions(left.partition, right.partition));
}

/** `purpose` as a sentence: its first letter upper-case, ending in a full stop. */
function describe(purpose: string): string {
  return `${purpose.charAt(0).toUpperCase()}${purpose.slice(1)}.`;
}

/** The section `page` lies in, `undefined` at the wiki root. */
function sectionOf(page: MapPage): WikiSection | undefined {
  const place = placePage(page.path);
  if (place.kind === 'unplaced') {
    throw new Error(`${page.path} lies in no section; readMapSources reports it as a defect`);
  }
  return place.kind === 'section' ? place.section : undefined;
}

/** Lines of one kind, and the text they and their headings print. */
interface Block {
  readonly kind: MapLineKind | undefined;
  readonly lines: readonly string[];
}

function listReadWhen(entries: readonly { name: string; path: string; readWhen: string }[]) {
  return entries
    .map((entry) => `- ${entry.readWhen}: [${entry.name}](${entry.path})`)
    .sort(compareBytes);
}

/** Text lines that list nothing; their words count to no kind. */
function plain(...lines: string[]): Block {
  return { kind: undefined, lines };
}

/** A `heading`, a blank line, the listed `lines` of `kind`, a blank line; nothing without lines. */
function section(heading: string, kind: MapLineKind, lines: readonly string[]): Block[] {
  return lines.length === 0 ? [] : [plain(heading, ''), { kind, lines }, plain('')];
}

/** The level printed from `blocks`, and the kind of line holding the most of its words. */
function print(level: MapLevel, blocks: readonly Block[]): RenderedLevel {
  const text = blocks.flatMap(({ lines }) => lines).join('\n');
  const byKind = new Map<MapLineKind, number>();
  for (const { kind, lines } of blocks) {
    if (kind === undefined) continue;
    byKind.set(kind, (byKind.get(kind) ?? 0) + countWords(lines.join('\n')));
  }
  let largest: MapLineKind | undefined;
  for (const [kind, words] of byKind) {
    if (largest === undefined || words > (byKind.get(largest) ?? 0)) largest = kind;
  }
  return { level, text, words: countWords(text), largest };
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

function listPageLines(content: MapContent, within: WikiSection | undefined): string[] {
  return listReadWhen(content.pages.filter((page) => sectionOf(page) === within));
}

/** The partitions one level below `parent`, the root when it is `undefined`. */
function listChildren(content: MapContent, parent: string | undefined): string[] {
  return listPartitions(content.projects).filter((partition) => {
    const cut = partition.lastIndexOf('/');
    return cut === -1 ? parent === undefined : partition.slice(0, cut) === parent;
  });
}

/**
 * The root of the map: the pages at the wiki root, then each wiki section with what its pages
 * are for and their "Read when" lines, then each top-level partition with its purpose and the
 * command that prints it. When that exceeds {@link indexWordBudget}, each section is collapsed to
 * one line, its purpose and the command that prints it (`wiki map <directory>`). Links are
 * repository-root-relative paths; the text has LF endings and carries no dates or absolute paths.
 */
export function renderRootMap(content: MapContent): RenderedLevel {
  const level: MapLevel = { kind: 'root' };
  const sections = listSections(content.pages);
  const rootPages = listPageLines(content, undefined);
  const partitions = section(
    '## Partitions',
    'partitions',
    listPartitionLines(content, listChildren(content, undefined)),
  );
  const pagesHeading =
    rootPages.length === 0 && sections.length === 0 ? [] : [plain('## Read when', '')];
  const rootBlock =
    rootPages.length === 0 ? [] : [{ kind: 'pages' as const, lines: rootPages }, plain('')];
  const expanded = print(level, [
    plain('# Wiki map', ''),
    ...pagesHeading,
    ...rootBlock,
    ...sections.flatMap((within) => [
      plain(`### ${within.heading}`, '', describe(within.purpose), ''),
      { kind: 'pages' as const, lines: listPageLines(content, within) },
      plain(''),
    ]),
    ...partitions,
  ]);
  if (expanded.words <= indexWordBudget) return expanded;
  return print(level, [
    plain('# Wiki map', ''),
    ...section('## Read when', 'pages', rootPages),
    ...section(
      '## Sections',
      'sections',
      sections.map(
        (within) =>
          `- ${within.purpose}: \`${formatMapCommand(content.invocation, within.directory)}\``,
      ),
    ),
    ...partitions,
  ]);
}

/**
 * The map of the wiki section `within`: what its pages are for, then their "Read when" lines.
 */
export function renderSectionMap(content: MapContent, within: WikiSection): RenderedLevel {
  return print({ kind: 'section', section: within }, [
    plain(`# Wiki map: ${within.directory}`, '', describe(within.purpose), ''),
    ...section('## Read when', 'pages', listPageLines(content, within)),
  ]);
}

/**
 * The map of `partition`: its purpose, the "Read when" line of each project placed in it, linking
 * its file to read first, then its whole subtree, one section per partition below it, when that
 * fits {@link indexWordBudget}; otherwise each partition one level below collapsed to its purpose
 * and the command that prints it. A level over budget is then one whose own projects and child
 * partitions do not fit.
 *
 * @throws Error when `partition` is not one {@link listPartitions} gives.
 */
export function renderPartitionMap(content: MapContent, partition: string): RenderedLevel {
  if (!listPartitions(content.projects).includes(partition)) {
    throw new Error(`the map shows no partition ${partition}`);
  }
  const level: MapLevel = { kind: 'partition', path: partition };
  const head = [
    plain(`# Wiki map: ${partition}`, '', `Read this when ${purposeOf(content, partition)}.`, ''),
    ...section('## Read when', 'projects', listProjectLines(content, partition)),
  ];
  const subtree = listPartitions(content.projects).filter((below) =>
    below.startsWith(`${partition}/`),
  );
  const whole = print(level, [
    ...head,
    ...subtree.flatMap((below) => {
      const lines = listProjectLines(content, below);
      return [
        plain(`## ${below}`, '', `Read this when ${purposeOf(content, below)}.`, ''),
        ...(lines.length === 0 ? [] : [{ kind: 'projects' as const, lines }, plain('')]),
      ];
    }),
  ]);
  if (whole.words <= indexWordBudget) return whole;
  return print(level, [
    ...head,
    ...section(
      '## Partitions',
      'children',
      listPartitionLines(content, listChildren(content, partition)),
    ),
  ]);
}

/**
 * Every level the map prints: the root, then each wiki section holding pages, then each
 * partition.
 */
export function renderMapLevels(content: MapContent): RenderedLevel[] {
  return [
    renderRootMap(content),
    ...listSections(content.pages).map((within) => renderSectionMap(content, within)),
    ...listPartitions(content.projects).map((partition) => renderPartitionMap(content, partition)),
  ];
}
