import type { CommandBrief } from '@puni/shared-command';
import { posix } from 'node:path';
import {
  isRecord,
  nameProject,
  parseJson,
  readMarkdown,
  readProjectFiles,
  repositoryScope,
} from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import {
  type DocSelection,
  listCode,
  listInlineCode,
  readPathReference,
  selectsDocumentation,
} from '../docs';
import { isGeneratedFile, readAttributes } from '../generated-files';
import { readSourceFile } from '../source-files';
import { listReadAnchors, readAsBefore } from '../links';
import { findMissingAnchor } from './links.rule';

/**
 * The code a docs rule reads in the file at `path`: the inline code spans, and, for commands,
 * the code-block lines too, each with the line it stands on when the file is source, whose doc
 * comment holds it.
 */
export interface DocCode {
  readonly path: string;
  /** Whether the code stands in a doc comment of a source file, not in documentation. */
  readonly inComment: boolean;
  readonly spans: readonly CodePiece[];
  readonly blocks: readonly CodePiece[];
}

/** One piece of code, and its 1-based line in a source file, if it stands in one. */
export interface CodePiece {
  readonly code: string;
  readonly line?: number;
}

/** How a breach names where a piece of code stands. */
function placeIn({ line }: CodePiece): string {
  return line === undefined ? '' : `line ${String(line)} `;
}

/** The visible documentation files the scope owns by `selection` (see `selectsDocumentation`). */
function listDocumentationFiles({ files, scope }: RuleReading, selection: DocSelection): string[] {
  return files.listVisible(scope).filter((path) => selectsDocumentation(files, path, selection));
}

/**
 * The code of the documentation the scope owns as epochs 1 and 2 read it: inline spans outside
 * fenced blocks and, as blocks, each fenced line (see `listInlineCode`).
 */
function listEarlierDocumentationCode(reading: RuleReading): DocCode[] {
  return listDocumentationFiles(reading, 'path').map((path) => {
    const text = reading.files.readText(path);
    const spans = listInlineCode(text).map((code) => ({ code }));
    const blocks = listCode(text)
      .slice(spans.length)
      .map((code) => ({ code }));
    return { path, inComment: false, spans, blocks };
  });
}

/**
 * The code of `text`, Markdown, as `readMarkdown` reads it with {@link readAsBefore}, each line
 * moved by `shift`: its spans, and the lines of its fenced and indented code blocks.
 */
function readCode(text: string, shift: number | undefined) {
  const markdown = readMarkdown(text, readAsBefore);
  const at = (line: number) => (shift === undefined ? {} : { line: line + shift });
  return {
    spans: markdown.spans.map(({ code, line }) => ({ code, ...at(line) })),
    blocks: markdown.codeLines.map(({ text: code, line }) => ({ code, ...at(line) })),
  };
}

/**
 * The visible files the scope owns whose doc comments the run judges: those a source reader
 * reads at the repository's pin and can read, but for what `.gitattributes` marks generated or
 * vendored (see `isGeneratedFile`), whose comments no one writes.
 */
export function listCommentedFiles(reading: RuleReading): string[] {
  const attributes = readAttributes(reading.files);
  return reading.files
    .listVisible(reading.scope)
    .filter(
      (path) => !isGeneratedFile(attributes, path) && readSourceFile(reading, path) !== undefined,
    );
}

/**
 * The code of the documentation the scope owns by `selection`, then that of the doc comments of
 * its sources.
 */
function listEveryDocCode(reading: RuleReading, selection: DocSelection): DocCode[] {
  const documentation = listDocumentationFiles(reading, selection).map((path) => ({
    path,
    inComment: false,
    ...readCode(reading.files.readText(path), undefined),
  }));
  const comments = listCommentedFiles(reading).flatMap((path) =>
    (readSourceFile(reading, path)?.docComments ?? []).map(({ line, text }) => ({
      path,
      inComment: true,
      ...readCode(text, line - 1),
    })),
  );
  return [...documentation, ...comments];
}

/**
 * The repository path a backticked `token` of `doc` names, or `undefined` when it names none
 * this repository holds. A token of a documentation file is a path from the root. One of a doc
 * comment is a path from the commented file's directory when that exists, which it holds, else
 * from the root when its first segment exists there, else a path of something else: another
 * repository, a URL path, a git ref.
 */
function placeToken(files: RuleReading['files'], doc: DocCode, path: string): string | undefined {
  if (!doc.inComment) return path;
  if (files.isShown(posix.join(posix.dirname(doc.path), path))) return undefined;
  const [first = ''] = path.split('/');
  return files.isShown(first) ? path : undefined;
}

/**
 * The breaches of the backticked paths of `docs` (see {@link judgeDocPaths}), a fragment matched
 * against the anchors `anchors` reads.
 */
function judgePaths(
  reading: RuleReading,
  docs: readonly DocCode[],
  anchors?: (text: string) => ReadonlySet<string>,
): Breach[] {
  const { files, references } = reading;
  return docs.flatMap((doc) =>
    doc.spans.flatMap((piece): Breach[] => {
      const span = piece.code;
      const reference = readPathReference(span);
      const placed = reference === undefined ? undefined : placeToken(files, doc, reference.path);
      if (
        reference === undefined ||
        placed === undefined ||
        !reachesReference(references, doc.path, placed)
      ) {
        return [];
      }
      const at = placeIn(piece);
      if (!files.isShown(placed)) {
        return [{ path: doc.path, message: `${at}names the missing path ${span}` }];
      }
      const missing = findMissingAnchor(files, placed, reference.fragment, anchors);
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
  judge: (reading) => judgePaths(reading, listEarlierDocumentationCode(reading)),
};

/**
 * {@link judgeMarkdownPaths} over the documentation the scope owns and the doc comments of the
 * files of {@link listCommentedFiles}, a token in a comment placed by `placeToken` and a breach
 * naming the line it stands on. Epoch 3; {@link judgeTypedDocPaths} chooses the documentation
 * by its declared type.
 */
export const judgeDocPaths: Rule = {
  id: 'docs.paths',
  since: 3,
  until: 4,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listEveryDocCode(reading, 'path'), listReadAnchors),
};

/**
 * {@link judgeDocPaths} over the Markdown whose declared type the documentation rules judge,
 * wherever it lies, and every doc comment.
 */
export const judgeTypedDocPaths: Rule = {
  id: 'docs.paths',
  since: 4,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listEveryDocCode(reading, 'type'), listReadAnchors),
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
function judgeCommands(reading: RuleReading, docs: readonly DocCode[]): Breach[] {
  const read = readScripts(reading);
  if ('breach' in read) return [read.breach];
  const { scripts } = read;
  const program = reading.commands[0]?.path.split(' ')[0];
  const projects = new Set(
    readProjectFiles(reading.files, repositoryScope).flatMap((file) => nameProject(file) ?? []),
  );
  return docs.flatMap((doc) =>
    [...doc.spans, ...doc.blocks].flatMap((piece): Breach[] => {
      const { path } = doc;
      const { code } = piece;
      const at = placeIn(piece);
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
  judge: (reading) => judgeCommands(reading, listEarlierDocumentationCode(reading)),
};

/**
 * {@link judgeMarkdownCommands} over the documentation the scope owns and the doc comments of
 * the files of {@link listCommentedFiles}, a breach naming the line it stands on. Epoch 3;
 * {@link judgeTypedDocCommands} chooses the documentation by its declared type.
 */
export const judgeDocCommands: Rule = {
  id: 'docs.commands',
  since: 3,
  until: 4,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listEveryDocCode(reading, 'path')),
};

/**
 * {@link judgeDocCommands} over the Markdown whose declared type the documentation rules judge,
 * wherever it lies, and every doc comment.
 */
export const judgeTypedDocCommands: Rule = {
  id: 'docs.commands',
  since: 4,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listEveryDocCode(reading, 'type')),
};
