import type { CommandBrief } from '@puni/shared-command';
import {
  isRecord,
  nameProject,
  parseJson,
  readProjectFiles,
  repositoryScope,
} from '@puni/shared-checkout';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { isDocumentation, listCode, listInlineCode, readPathReference } from '../docs';
import { findMissingAnchor } from './links.rule';

/** The visible documentation files the scope owns. */
function listDocumentation({ files, scope }: RuleReading): readonly string[] {
  return files.listVisible(scope).filter(isDocumentation);
}

/**
 * Every backticked token in the documentation the scope owns that looks like a repository path
 * (see `readPathReference`) names something that exists, and its `#fragment`, if the path is
 * Markdown, one of its headings, among the references the run's reach judges.
 */
export const judgeDocPaths: Rule = {
  id: 'docs.paths',
  since: 1,
  remedy: 'correct the path to one that exists, or remove it',
  judge(reading) {
    const { files, references } = reading;
    return listDocumentation(reading).flatMap((path) =>
      listInlineCode(files.readText(path)).flatMap((span): Breach[] => {
        const reference = readPathReference(span);
        if (reference === undefined || !reachesReference(references, path, reference.path)) {
          return [];
        }
        if (!files.isShown(reference.path)) {
          return [{ path, message: `names the missing path ${span}` }];
        }
        const missing = findMissingAnchor(files, reference.path, reference.fragment);
        return missing === undefined
          ? []
          : [
              {
                path,
                message: `names ${span}, but ${missing}`,
                remedy: `name a heading of ${reference.path}, or drop the fragment`,
              },
            ];
      }),
    );
  },
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

/**
 * Every `bun run <script>` in the code of the documentation the scope owns names a script of the
 * root `package.json`; every `<program> <words…>` names a command of the CLI's tree: the
 * longest prefix of plain lower-case words that the tree holds, flags and placeholders ending
 * the words; and every Nx project named by `nx run`, `nx <target>` or `-p` (see
 * `listNxProjects`) is a project of the repository.
 */
export const judgeDocCommands: Rule = {
  id: 'docs.commands',
  since: 1,
  remedy: 'name a command that `puni --help` lists, or remove it',
  judge(reading) {
    const read = readScripts(reading);
    if ('breach' in read) return [read.breach];
    const { scripts } = read;
    const program = reading.commands[0]?.path.split(' ')[0];
    const projects = new Set(
      readProjectFiles(reading.files, repositoryScope).flatMap((file) => nameProject(file) ?? []),
    );
    return listDocumentation(reading).flatMap((path) =>
      listCode(reading.files.readText(path)).flatMap((code): Breach[] => {
        const breaches: Breach[] = [...code.matchAll(/\bbun run ([\w:.-]+)/gu)]
          .map((match) => match[1] ?? '')
          .filter((script) => !scripts.has(script))
          .map((script) => ({
            path,
            message: `runs the script ${script}, which package.json does not define`,
            remedy: 'name a script the root package.json defines, or add the script there',
          }));
        for (const name of listNxProjects(code).filter((named) => !projects.has(named))) {
          breaches.push({
            path,
            message: `names no Nx project ${name}`,
            remedy: 'name a project `bunx nx show projects` lists, or remove it',
          });
        }
        if (program === undefined) return breaches;
        for (const match of code.matchAll(
          new RegExp(`\\b${program}((?:\\s+[a-z][\\w-]*)+)`, 'gu'),
        )) {
          const words = (match[1] ?? '').trim().split(/\s+/u);
          const unknown = findUnknownCommand(reading.commands, program, words);
          if (unknown !== undefined) {
            breaches.push({ path, message: `names no command ${unknown.known} ${unknown.word}` });
          }
        }
        return breaches;
      }),
    );
  },
};
