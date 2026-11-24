import type { CommandBrief } from '@puni/shared-command';
import {
  isRecord,
  nameProject,
  parseJson,
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
import { findMissingAnchor } from './links.rule';

/**
 * A text the docs rules read, in the file at `path`: a documentation file whole, with `at`
 * empty, or one doc comment of a source file, `at` naming its line for a breach's message.
 */
export interface DocText {
  readonly path: string;
  readonly text: string;
  readonly at: string;
}

/** The visible documentation files the scope owns by `selection`, each whole. */
function listDocumentation({ files, scope }: RuleReading, selection: DocSelection): DocText[] {
  return files
    .listVisible(scope)
    .filter((path) => selectsDocumentation(files, path, selection))
    .map((path) => ({ path, text: files.readText(path), at: '' }));
}

/**
 * Every doc comment of the visible files the scope owns that a source reader of the run reads,
 * as the reader gives it, `at` naming its line.
 */
export function listDocComments({ files, scope, sources }: RuleReading): DocText[] {
  return files.listVisible(scope).flatMap((path) => {
    const reader = sources.readerOf(path);
    if (reader === undefined) return [];
    return reader.docComments(files.readText(path)).map(({ line, text }) => ({
      path,
      text,
      at: `doc comment at line ${String(line)} `,
    }));
  });
}

/** The documentation the scope owns by `selection`, then the doc comments of its source files. */
function listEveryDocText(reading: RuleReading, selection: DocSelection): DocText[] {
  return [...listDocumentation(reading, selection), ...listDocComments(reading)];
}

/** The breaches of the backticked paths of `docs` (see {@link judgeDocPaths}). */
function judgePaths(reading: RuleReading, docs: readonly DocText[]): Breach[] {
  const { files, references } = reading;
  return docs.flatMap(({ path, text, at }) =>
    listInlineCode(text).flatMap((span): Breach[] => {
      const reference = readPathReference(span);
      if (reference === undefined || !reachesReference(references, path, reference.path)) {
        return [];
      }
      if (!files.isShown(reference.path)) {
        return [{ path, message: `${at}names the missing path ${span}` }];
      }
      const missing = findMissingAnchor(files, reference.path, reference.fragment);
      return missing === undefined
        ? []
        : [
            {
              path,
              message: `${at}names ${span}, but ${missing}`,
              remedy: `name a heading of ${reference.path}, or drop the fragment`,
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
  judge: (reading) => judgePaths(reading, listDocumentation(reading, 'path')),
};

/**
 * {@link judgeMarkdownPaths} over the documentation the scope owns and every doc comment of its
 * source files that a source reader reads, a path in a comment named from the repository root.
 * Epoch 3; {@link judgeTypedDocPaths} chooses the documentation by its declared type.
 */
export const judgeDocPaths: Rule = {
  id: 'docs.paths',
  since: 3,
  until: 4,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listEveryDocText(reading, 'path')),
};

/**
 * {@link judgeDocPaths} over the Markdown whose declared type the documentation rules judge,
 * wherever it lies, and every doc comment.
 */
export const judgeTypedDocPaths: Rule = {
  id: 'docs.paths',
  since: 4,
  remedy: pathsRemedy,
  judge: (reading) => judgePaths(reading, listEveryDocText(reading, 'type')),
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
  return docs.flatMap(({ path, text, at }) =>
    listCode(text).flatMap((code): Breach[] => {
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
  judge: (reading) => judgeCommands(reading, listDocumentation(reading, 'path')),
};

/**
 * {@link judgeMarkdownCommands} over the documentation the scope owns and every doc comment of
 * its source files that a source reader reads. Epoch 3; {@link judgeTypedDocCommands} chooses
 * the documentation by its declared type.
 */
export const judgeDocCommands: Rule = {
  id: 'docs.commands',
  since: 3,
  until: 4,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listEveryDocText(reading, 'path')),
};

/**
 * {@link judgeDocCommands} over the Markdown whose declared type the documentation rules judge,
 * wherever it lies, and every doc comment.
 */
export const judgeTypedDocCommands: Rule = {
  id: 'docs.commands',
  since: 4,
  remedy: commandsRemedy,
  judge: (reading) => judgeCommands(reading, listEveryDocText(reading, 'type')),
};
