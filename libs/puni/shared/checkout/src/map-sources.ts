import { compareBytes } from './byte-order';
import type { CheckoutFiles, ProjectSource } from './contract';
import { parseFrontMatter } from './front-matter';
import { repositoryScope } from './ownership';
import { judgeReadWhen } from './read-when';
import { placePage, wikiSections } from './wiki-sections';

/**
 * One input of the map that is missing or invalid, named by its repository path, and what to do
 * about it. `topic` says which check reports it: `read-first` for a project's file to read first,
 * `scope` for its place in the map, `section` for a page outside the wiki root and its sections,
 * `read-when` for the rest.
 */
export interface SourceDefect {
  readonly topic: 'read-when' | 'read-first' | 'scope' | 'section';
  readonly path: string;
  readonly message: string;
  readonly remedy: string;
}

/**
 * The directory puni generated the wiki index into before the map was printed: never a page or
 * documentation, and from rules epoch 2 a leftover the `index.leftover` rule reports.
 */
export const generatedIndexDirectory = 'wiki/index';

/** What to do about a `read-when` defect, of a page or a project. */
export const readWhenRemedy =
  'give it a phrase completing "Read this when …": lower-case first letter, one line, no full stop, at most 20 words (a page holds it as front matter with a title)';

/** What to do about a `section` defect: the sections a page may move to. */
export const sectionRemedy = `move the page to wiki/ or to the section its content is: ${wikiSections
  .map(({ directory, purpose }) => `wiki/${directory}/ for ${purpose}`)
  .join('; ')}`;

/** An authored wiki page as the map lists it: its title, its path and its `read-when`. */
export interface MapPage {
  readonly name: string;
  readonly path: string;
  readonly readWhen: string;
}

/**
 * A project as the map lists it: its name, its root directory, its index path (the partition
 * that lists it, as segments), its "Read when" phrase and the repository path of its file to read
 * first.
 */
export interface MapProject {
  readonly name: string;
  readonly root: string;
  readonly index: readonly string[];
  readonly readWhen: string;
  readonly readFirst: string;
}

/** What one {@link ProjectSource} read: its projects, and every defect it found. */
export interface ProjectReading {
  readonly projects: readonly MapProject[];
  readonly defects: readonly SourceDefect[];
}

/** Everything the map is built from, with every defect found while reading it, sorted by path. */
export interface MapSources {
  readonly pages: readonly MapPage[];
  readonly projects: readonly MapProject[];
  readonly defects: readonly SourceDefect[];
}

type PageReading = { readonly page: MapPage } | { readonly defect: SourceDefect };

function defectOf(path: string, message: string): PageReading {
  return { defect: { topic: 'read-when', path, message, remedy: readWhenRemedy } };
}

/**
 * The `title` and `read-when` of an authored page, from front matter that opens the file between
 * two `---` lines and holds one `key: value` per line. A page outside the wiki root and its
 * {@link wikiSections} is a `section` defect, whatever its front matter.
 */
function readPage(path: string, text: string): PageReading {
  const place = placePage(path);
  if (place.kind === 'unplaced') {
    const sections = wikiSections.map(({ directory }) => `wiki/${directory}/`).join(', ');
    const message = `lies in wiki/${place.directory}/, which is not wiki/ or a section (${sections})`;
    return { defect: { topic: 'section', path, message, remedy: sectionRemedy } };
  }
  const frontMatter = parseFrontMatter(text);
  if ('problem' in frontMatter) {
    return defectOf(
      path,
      frontMatter.problem === 'absent'
        ? 'does not begin with front matter'
        : `has a malformed front matter line: ${frontMatter.line}`,
    );
  }
  const fields = new Map(frontMatter.fields.map((field) => [field.key, field.value]));
  const title = fields.get('title');
  if (title === undefined || title === '') return defectOf(path, 'has no title');
  const readWhen = fields.get('read-when');
  if (readWhen === undefined || readWhen === '') {
    return defectOf(path, 'has no read-when');
  }
  const problem = judgeReadWhen(readWhen);
  if (problem !== undefined) return defectOf(path, `read-when ${problem}`);
  return { page: { name: title, path, readWhen } };
}

/**
 * The map sources of `files`, pinned at the rules epoch `epoch`: every visible authored page
 * (Markdown under `wiki/` outside {@link generatedIndexDirectory}), and the projects every one of
 * `projectSources` reads at that epoch, in their order. A defect is no failure; each is returned,
 * sorted by path.
 */
export function readMapSources(
  files: CheckoutFiles,
  projectSources: readonly ProjectSource[],
  epoch: number,
): MapSources {
  const readings = files
    .listVisible(repositoryScope)
    .filter((path) => path.startsWith('wiki/') && path.endsWith('.md'))
    .filter((path) => !path.startsWith(`${generatedIndexDirectory}/`))
    .map((path) => readPage(path, files.readText(path)));
  const projects = projectSources.map((source) => source.readProjects(files, epoch));
  return {
    pages: readings.flatMap((reading) => ('page' in reading ? [reading.page] : [])),
    projects: projects.flatMap((reading) => reading.projects),
    defects: [
      ...readings.flatMap((reading) => ('defect' in reading ? [reading.defect] : [])),
      ...projects.flatMap((reading) => reading.defects),
    ].sort((left, right) => compareBytes(left.path, right.path)),
  };
}
