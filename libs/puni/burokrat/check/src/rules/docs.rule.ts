import type { CommandBrief } from '@puni/shared-command';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { isDocumentation, listCode, listInlineCode, readPathToken } from '../docs';

/** The visible documentation files the scope owns. */
function listDocumentation({ files, scope }: RuleReading): readonly string[] {
  return files.listVisible(scope).filter(isDocumentation);
}

/**
 * Every backticked token in the documentation the scope owns that looks like a repository path
 * (see `readPathToken`) names something that exists, among the references the run's reach
 * judges.
 */
export const judgeDocPaths: Rule = {
  id: 'docs.paths',
  remedy: 'correct the path to one that exists, or remove it',
  judge(reading) {
    const { files, references } = reading;
    return listDocumentation(reading).flatMap((path) =>
      listInlineCode(files.readText(path)).flatMap((span) => {
        const token = readPathToken(span);
        if (token === undefined || !reachesReference(references, path, token)) return [];
        return files.exists(token) ? [] : [{ path, message: `names the missing path ${span}` }];
      }),
    );
  },
};

/** The scripts of the root `package.json`, or the breach of one that cannot be read. */
function readScripts({
  files,
}: RuleReading): { readonly scripts: ReadonlySet<string> } | { readonly breach: Breach } {
  if (!files.exists('package.json')) return { scripts: new Set() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(files.readText('package.json'));
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return {
      breach: {
        path: 'package.json',
        message: `is not valid JSON: ${cause.message}`,
        remedy: 'make package.json valid JSON',
      },
    };
  }
  const scripts =
    typeof parsed === 'object' && parsed !== null && 'scripts' in parsed ? parsed.scripts : {};
  const names = typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
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

/**
 * Every `bun run <script>` in the code of the documentation the scope owns names a script of the
 * root `package.json`, and every `<program> <words…>` names a command of the CLI's tree: the
 * longest prefix of plain lower-case words that the tree holds, flags and placeholders ending
 * the words.
 */
export const judgeDocCommands: Rule = {
  id: 'docs.commands',
  remedy: 'name a command that `puni --help` lists, or remove it',
  judge(reading) {
    const read = readScripts(reading);
    if ('breach' in read) return [read.breach];
    const { scripts } = read;
    const program = reading.commands[0]?.path.split(' ')[0];
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
