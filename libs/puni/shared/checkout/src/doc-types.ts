import { posix } from 'node:path';
import { recordDirectories } from './record-directories';
import type { RepositoryType } from './registry';
import { placePage, wikiSections } from './wiki-sections';

/** The front-matter key a Markdown file declares its document type with. */
export const docTypeKey = 'puni-doc-type';

/**
 * The rules epoch from which every Markdown file of a governed repository declares a document
 * type, and the rules choose the files they judge by it: the `docs.type` rule's `since`.
 */
export const docTypesEpoch = 4;

/** The extensions of a Markdown file. */
export const markdownExtensions: readonly string[] = ['.md', '.mdx', '.markdown'];

/** Whether the file at `path` is Markdown, by its extension. */
export function isMarkdown(path: string): boolean {
  return markdownExtensions.includes(posix.extname(path));
}

/**
 * Which rules judge a document of a type: `documentation` is read by agents working in the
 * repository, so the documentation rules (its paths, commands, references, dates and budgets)
 * judge it; `product` is for the people who use what the repository makes, so only what every
 * file meets (secrets, addresses) and `links.resolve` judge it; `record` is judged by the
 * records rules.
 */
export type DocJudging = 'documentation' | 'product' | 'record';

/** A document type: which rules judge it, and where a document of it may live. */
export interface DocType {
  readonly judgedAs: DocJudging;
  /** Where a document of the type may live, completing "a document of this type lives …". */
  readonly lives: string;
  /** Whether a document at the repository path `path` of a `repository` may be of the type. */
  isPlaced(path: string, repository: RepositoryType): boolean;
}

/** The names a Markdown file is an entry file by, wherever it lies: never product documentation. */
const entryNames: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'README.md'];

const kindDirectories: readonly string[] = Object.values(recordDirectories);

/** Whether `path` lies directly in a kind directory of a `repository`, which only records have. */
function isRecordPath(path: string, repository: RepositoryType): boolean {
  return repository === 'system-records' && kindDirectories.includes(posix.dirname(path));
}

/** The document types by name, as {@link docTypes} gives them. */
const typeEntries = {
  agents: {
    judgedAs: 'documentation',
    lives: 'only as AGENTS.md at the repository root',
    isPlaced: (path) => path === 'AGENTS.md',
  },
  readme: {
    judgedAs: 'documentation',
    lives: 'only as README.md at the repository root',
    isPlaced: (path) => path === 'README.md',
  },
  'wiki-page': {
    judgedAs: 'documentation',
    lives: `only directly in wiki/ or in one of its sections (${wikiSections.map(({ directory }) => `wiki/${directory}/`).join(', ')})`,
    isPlaced: (path) => path.startsWith('wiki/') && placePage(path).kind !== 'unplaced',
  },
  product: {
    judgedAs: 'product',
    lives: `outside wiki/ and the records' kind directories, under a name other than ${entryNames.join(', ')}`,
    isPlaced: (path, repository) =>
      !path.startsWith('wiki/') &&
      !entryNames.includes(posix.basename(path)) &&
      !isRecordPath(path, repository),
  },
  record: {
    judgedAs: 'record',
    lives: `only directly in a kind directory of the records repository (${kindDirectories.join(', ')})`,
    isPlaced: isRecordPath,
  },
} satisfies Readonly<Record<string, DocType>>;

/** The name of a document type, a key of {@link docTypes}. */
export type DocTypeName = keyof typeof typeEntries;

/**
 * The document types, the closed set a Markdown file's `puni-doc-type` names, by name; adding a
 * type is adding an entry:
 *
 * - `agents`: the rules every session follows, `AGENTS.md` at the root of either repository.
 * - `readme`: what the repository is, for a person arriving: `README.md` at the root.
 * - `wiki-page`: one answer to "Read this when …", in `wiki/` or one of its sections.
 * - `product`: documentation for the people who use what the repository makes, anywhere else
 *   but under an entry file's name.
 * - `record`: a record, directly in a kind directory of the records repository.
 */
export const docTypes: Readonly<Record<DocTypeName, DocType>> = typeEntries;

function isDocTypeName(value: string): value is DocTypeName {
  return Object.hasOwn(docTypes, value);
}

/** The names of the document types, in the order {@link docTypes} lists them. */
export const docTypeNames: readonly DocTypeName[] = Object.keys(docTypes).filter(isDocTypeName);

/**
 * What a Markdown text declares as its type: a known type, a value that names none, or nothing,
 * as a text with no front matter, or front matter without the key, declares.
 */
export type DocTypeDeclaration =
  | { readonly kind: 'declared'; readonly type: DocTypeName }
  | { readonly kind: 'unknown'; readonly value: string }
  | { readonly kind: 'undeclared' };

/** The lines of the front matter that opens `text` between two `---` lines, if it has one. */
function readFrontMatterLines(text: string): string[] | undefined {
  const lines = text.split(/\r?\n/u);
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 ? lines.slice(1, end) : undefined;
}

const keyLine = new RegExp(`^${docTypeKey}:(.*)$`, 'u');

/**
 * The {@link DocTypeDeclaration} of the Markdown `text`: the value of its first
 * `puni-doc-type: <type>` line of front matter, trimmed. Only that line is read, so front matter
 * holding other YAML, as a product site's may, declares a type as well.
 */
export function readDocType(text: string): DocTypeDeclaration {
  const lines = readFrontMatterLines(text) ?? [];
  for (const line of lines) {
    const value = keyLine.exec(line)?.[1]?.trim();
    if (value === undefined) continue;
    return isDocTypeName(value) ? { kind: 'declared', type: value } : { kind: 'unknown', value };
  }
  return { kind: 'undeclared' };
}

/**
 * The Markdown `text` declaring `type`: unchanged when it declares a type already; else its
 * front matter given the `puni-doc-type` line first, or, with none, opened by front matter
 * holding only that line and a blank line.
 */
export function declareDocType(text: string, type: DocTypeName): string {
  if (readDocType(text).kind !== 'undeclared') return text;
  const line = `${docTypeKey}: ${type}`;
  if (readFrontMatterLines(text) !== undefined) return text.replace(/^---/u, `---\n${line}`);
  return `---\n${line}\n---\n\n${text}`;
}

/** The document types whose documents may live at `path` of a `repository`. */
export function listPlacedTypes(path: string, repository: RepositoryType): DocTypeName[] {
  return docTypeNames.filter((name) => docTypes[name].isPlaced(path, repository));
}
