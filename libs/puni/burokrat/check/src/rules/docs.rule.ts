import type { CommandBrief } from '@puni/shared-command';
import {
  isRecord,
  nameProject,
  parseJson,
  readProjectFiles,
  repositoryScope,
} from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { posix } from 'node:path';
import { isDocumentation, listCodeLines, readPathReference } from '../docs';
import { isGeneratedFile } from '../generated-files';
import { findMissingAnchor } from './links.rule';

/**
 * A text the docs rules read, in the file at `path`: a documentation file whole, with no `line`,
 * or one doc comment of a source file, whose text's line `n` stands on line `line + n`.
 */
export interface DocText {
  readonly path: string;
  readonly text: string;
  readonly line?: number;
}

/** How a breach names where in `doc` a piece of code at line `offset` of it stands. */
function placeIn(doc: DocText, offset: number): string {
  return doc.line === undefined ? '' : `line ${String(doc.line + offset)} `;
}

/** The visible documentation files the scope owns, each whole (see `isDocumentation`). */
function listDocumentation({ files, scope }: RuleReading): DocText[] {
  return files
    .listVisible(scope)
    .filter(isDocumentation)
    .map((path) => ({ path, text: files.readText(path) }));
}

/**
 * The visible files the scope owns whose doc comments the run judges: those a source reader
 * reads at the repository's pin, but for what `.gitattributes` marks generated or vendored
 * (see `isGeneratedFile`), whose comments no one writes.
 */
export function listCommentedFiles({ files, scope, sources, registry }: RuleReading): string[] {
  const attributes = files.exists('.gitattributes') ? files.readText('.gitattributes') : '';
  return files
    .listVisible(scope)
    .filter(
      (path) =>
        sources.readerOf(path, registry.rules) !== undefined && !isGeneratedFile(attributes, path),
    );
}

/** Every doc comment of the files of {@link listCommentedFiles}, as its reader gives it. */
export function listDocComments(reading: RuleReading): DocText[] {
  return listCommentedFiles(reading).flatMap((path) => {
    const reader = reading.sources.readerOf(path, reading.registry.rules);
    if (reader === undefined) return [];
    return reader.docComments(reading.files.readText(path)).map(({ line, text }) => ({
      path,
      text,
      line,
    }));
  });
}

/** The documentation the scope owns, then the doc comments of its source files. */
function listEveryDocText(reading: RuleReading): DocText[] {
  return [...listDocumentation(reading), ...listDocComments(reading)];
}

/**
 * The repository path a backticked `token` of `doc` names, or `undefined` when it names none
 * this repository holds. A token of a documentation file is a path from the root. One of a doc
 * comment is a path from the commented file's directory when that exists, which it holds, else
 * from the root when its first segment exists there, else a path of something else: another
 * repository, a URL path, a git ref.
 */
function placeToken(files: RuleReading['files'], doc: DocText, path: string): string | undefined {
  if (doc.line === undefined) return path;
  if (files.isShown(posix.join(posix.dirname(doc.path), path))) return undefined;
  const [first = ''] = path.split('/');
  return files.isShown(first) ? path : undefined;
}

/** The breaches of the backticked paths of `docs` (see {@link judgeDocPaths}). */
function judgePaths(reading: RuleReading, docs: readonly DocText[]): Breach[] {
  const { files, references } = reading;
  return docs.flatMap((doc) =>
    listCodeLines(doc.text, false).flatMap(({ offset, code: span }): Breach[] => {
      const reference = readPathReference(span);
      const placed = reference === undefined ? undefined : placeToken(files, doc, reference.path);
      if (
        reference === undefined ||
        placed === undefined ||
        !reachesReference(references, doc.path, placed)
      ) {
        return [];
      }
      const at = placeIn(doc, offset);
      if (!files.isShown(placed)) {
        return [{ path: doc.path, message: `${at}names the missing path ${span}` }];
      }
      const missing = findMissingAnchor(files, placed, reference.fragment);
      return missing === undefined
        ? []
        : [
            {
              path: doc.path,
              message: `${at}names ${span}, but ${missing}`,
              remedy: `name a heading of ${placed}, or drop the fragment`,
            },
          ];
    }),
  );
}

const pathsRemedy = 'correct the path to one that exists, or remove it';

/**
 * Every backticked token in the documentation the scope owns that looks like a repository path
 * (see `readPathReference`) names something that exists, and its `#fragment`, if the path is
 * Markdown, one of its headings, among the references the run's reach judges. Epochs 1 and 2;
 * {@link judgeDocPaths} judges doc comments too.
 */
export const judgeMarkdownPaths: Rule = {
  id: 'docs.paths',
  since: 1,
  until: 3,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listDocumentation(reading)),
};

/**
 * {@link judgeMarkdownPaths} over the documentation the scope owns and the doc comments of the
 * files of {@link listCommentedFiles}, a token in a comment placed by `placeToken` and a breach
 * naming the line it stands on.
 */
export const judgeDocPaths: Rule = {
  id: 'docs.paths',
  since: 3,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listEveryDocText(reading)),
};

/** The scripts of the root `package.json`, or the breach of one that cannot be read. */
function readScripts({
  files,
}: RuleReading): { readonly scripts: ReadonlySet<string> } | { readonly breach: Breach } {
  if (!files.exists('package.json')) return { scripts: new Set() };
  const read = parseJson(files.readText('package.json'));
  if ('problem' in read) {
    return {
      breach: {
        path: 'package.json',
        message: read.problem,
        remedy: 'make package.json valid JSON',
      },
    };
  }
  const scripts = isRecord(read.value) ? read.value['scripts'] : undefined;
  const names = isRecord(scripts) ? Object.keys(scripts) : [];
  return { scripts: new Set(names) };
}

/**
 * The first word of `words` that names no command below the longest command path the catalog
 * holds for them, with that path; `undefined` when every word is a command, or the rest are the
 * arguments of a leaf. The program and its role groups always take a command next.
 */
function findUnknownCommand(
  commands: readonly CommandBrief[],
  program: string,
  words: readonly string[],
): { readonly known: string; readonly word: string } | undefined {
  const paths = new Set(commands.map((command) => command.path));
  let known = program;
  for (const [index, word] of words.entries()) {
    const next = `${known} ${word}`;
    if (paths.has(next)) {
      known = next;
      continue;
    }
    const isGroup = index < 2 || commands.some((command) => command.path.startsWith(`${known} `));
    return isGroup ? { known, word } : undefined;
  }
  return undefined;
}

/** The Nx commands that take no project as their next word; any other first word is a target. */
const nxCommands: ReadonlySet<string> = new Set([
  'add',
  'affected',
  'connect',
  'daemon',
  'exec',
  'format',
  'format:check',
  'format:write',
  'g',
  'generate',
  'graph',
  'import',
  'init',
  'list',
  'migrate',
  'release',
  'repair',
  'report',
  'reset',
  'run',
  'run-many',
  'show',
  'sync',
  'sync:check',
  'view-logs',
  'watch',
]);

const projectName = String.raw`[A-Za-z0-9@][\w.@/-]*`;

/**
 * The Nx project names a piece of code gives: `nx run <project>:<target>`, `nx <target> <project>`
 * (the first word not an Nx command), and each name of `-p` or `--projects` after an `nx`.
 * Placeholders and globs are no names.
 */
function listNxProjects(code: string): string[] {
  const named: string[] = [];
  for (const match of code.matchAll(new RegExp(`\\bnx run (${projectName}):`, 'gu'))) {
    named.push(match[1] ?? '');
  }
  const targetFirst = new RegExp(`\\bnx ([a-z][\\w:-]*) (${projectName})(?=\\s|$)`, 'gu');
  for (const match of code.matchAll(targetFirst)) {
    if (!nxCommands.has(match[1] ?? '')) named.push(match[2] ?? '');
  }
  const nx = /\bnx\b/u.exec(code);
  if (nx !== null) {
    const rest = code.slice(nx.index);
    for (const match of rest.matchAll(/(?:^|\s)(?:-p|--projects)[ =]([^\s'"`]+)/gu)) {
      const names = (match[1] ?? '').split(',');
      named.push(...names.filter((name) => new RegExp(`^${projectName}$`, 'u').test(name)));
    }
  }
  return named;
}

/** The breaches of the commands of `docs` (see {@link judgeMarkdownCommands}). */
function judgeCommands(reading: RuleReading, docs: readonly DocText[]): Breach[] {
  const read = readScripts(reading);
  if ('breach' in read) return [read.breach];
  const { scripts } = read;
  const program = reading.commands[0]?.path.split(' ')[0];
  const projects = new Set(
    readProjectFiles(reading.files, repositoryScope).flatMap((file) => nameProject(file) ?? []),
  );
  return docs.flatMap((doc) =>
    listCodeLines(doc.text, true).flatMap(({ offset, code }): Breach[] => {
      const { path } = doc;
      const at = placeIn(doc, offset);
      const breaches: Breach[] = [...code.matchAll(/\bbun run ([\w:.-]+)/gu)]
        .map((match) => match[1] ?? '')
        .filter((script) => !scripts.has(script))
        .map((script) => ({
          path,
          message: `${at}runs the script ${script}, which package.json does not define`,
          remedy: 'name a script the root package.json defines, or add the script there',
        }));
      for (const name of listNxProjects(code).filter((named) => !projects.has(named))) {
        breaches.push({
          path,
          message: `${at}names no Nx project ${name}`,
          remedy: 'name a project `bunx nx show projects` lists, or remove it',
        });
      }
      if (program === undefined) return breaches;
      for (const match of code.matchAll(new RegExp(`\\b${program}((?:\\s+[a-z][\\w-]*)+)`, 'gu'))) {
        const words = (match[1] ?? '').trim().split(/\s+/u);
        const unknown = findUnknownCommand(reading.commands, program, words);
        if (unknown !== undefined) {
          breaches.push({
            path,
            message: `${at}names no command ${unknown.known} ${unknown.word}`,
          });
        }
      }
      return breaches;
    }),
  );
}

const commandsRemedy = 'name a command that `puni --help` lists, or remove it';

/**
 * Every `bun run <script>` in the code of the documentation the scope owns names a script of the
 * root `package.json`; every `<program> <words…>` names a command of the CLI's tree: the
 * longest prefix of plain lower-case words that the tree holds, flags and placeholders ending
 * the words; and every Nx project named by `nx run`, `nx <target>` or `-p` (see
 * `listNxProjects`) is a project of the repository. Epochs 1 and 2; {@link judgeDocCommands}
 * judges doc comments too.
 */
export const judgeMarkdownCommands: Rule = {
  id: 'docs.commands',
  since: 1,
  until: 3,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listDocumentation(reading)),
};

/**
 * {@link judgeMarkdownCommands} over the documentation the scope owns and the doc comments of
 * the files of {@link listCommentedFiles}, a breach naming the line it stands on.
 */
export const judgeDocCommands: Rule = {
  id: 'docs.commands',
  since: 3,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listEveryDocText(reading)),
};
