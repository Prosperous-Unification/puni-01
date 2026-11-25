import {
  type InstalledGlobals,
  type SourceReader,
  SourceReaderFailed,
  type SourceReading,
  SourceUnreadable,
} from '@puni/shared-checkout';
import type ts from 'typescript';
import type { TypescriptCompiler } from './contract';
import { type Compiler, declare, listReexports, listTopLevel } from './declarations';
import { findDocComments, listLinkTags, listNodes } from './doc-comments';
import { listExpandos } from './expandos';
import { listTemplateNames } from './jsdoc-tags';
import {
  headOf,
  isJudgedTarget,
  listAmbientNames,
  listAugmentations,
  isShadowed,
  listTopNames,
  resolvesInFile,
  usesCommonJs,
} from './link-names';

/** The rules epoch from which the TypeScript and JavaScript readers are read. */
export const typescriptReadersSince = 3;

/** The extensions the compiler parses alike, the script kind it parses them as, and whether it is JavaScript. */
const languages = [
  { extensions: ['.ts', '.mts', '.cts'], kind: 'TS', javascript: false },
  { extensions: ['.tsx'], kind: 'TSX', javascript: false },
  { extensions: ['.js', '.mjs', '.cjs'], kind: 'JS', javascript: true },
  { extensions: ['.jsx'], kind: 'JSX', javascript: true },
] as const;

/** Everything a reader reads in the parsed `file`, in one walk of its nodes. */
function readFile(compiler: Compiler, file: ts.SourceFile, javascript: boolean): SourceReading {
  const { nodes, parents } = listNodes(compiler, file);
  const isModule = compiler.isExternalModule(file) || usesCommonJs(compiler, nodes);
  const hosted = findDocComments(compiler, file, nodes);
  const docComments = hosted.map(({ comment }) => comment);
  const topLevel = listTopLevel(
    compiler,
    file,
    docComments.map(({ text }) => text),
    javascript,
  );
  const templates = new Map<ts.Node, string[]>();
  if (javascript) {
    for (const { comment, host } of hosted) {
      const names = listTemplateNames(comment.text);
      if (names.length > 0) templates.set(host, [...(templates.get(host) ?? []), ...names]);
    }
  }
  const context = {
    compiler,
    file,
    parents,
    topNames: listTopNames(compiler, file),
    topLevel,
    tagged: new Set(topLevel.filter(({ node }) => node === file).map(({ name }) => name)),
    templates,
    expandos: listExpandos(compiler, nodes, parents, (node, name) =>
      isShadowed({ compiler, file, parents }, node, name),
    ),
  };
  return {
    declarations: declare(compiler, file, topLevel),
    reexports: listReexports(compiler, file),
    docComments,
    links: hosted.flatMap(({ comment: { line, text }, host }) =>
      listLinkTags(text)
        .filter(({ target }) => isJudgedTarget(target))
        .map(({ target, offset }) => {
          const verdict = resolvesInFile(context, host, target);
          return {
            target,
            line: line + offset,
            head: headOf(target),
            resolved: verdict === 'resolved',
            memberMissing: verdict === 'member-missing',
          };
        }),
    ),
    ambient: listAmbientNames(compiler, file, isModule),
    augmented: listAugmentations(compiler, file, isModule),
  };
}

/** The names `texts`, declaration files, declare for every file, each parsed as a script would be. */
function collectGlobals(compiler: Compiler, texts: readonly string[], into: Set<string>): void {
  for (const text of texts) {
    const file = compiler.createSourceFile('lib.d.ts', text, compiler.ScriptTarget.Latest, false);
    for (const name of listAmbientNames(compiler, file, compiler.isExternalModule(file))) {
      into.add(name);
    }
  }
}

/**
 * The {@link SourceReader}s of TypeScript and JavaScript, read from rules epoch
 * {@link typescriptReadersSince}, one per way the compiler parses a file (TypeScript, TSX,
 * JavaScript, JSX), each reading a text in one pass of the compiler's parser alone: no program,
 * no type checking and no other file, the syntax tree dropped once read. A text the parser
 * cannot follow, as one nested past the stack, is `SourceUnreadable`; any other failure of a
 * reading is the reader's own, `SourceReaderFailed`. The compiler is loaded on the first
 * reading, a compiler that cannot be loaded being `SourceReaderBroken`. The globals of a repository are the names the global declarations puni installs
 * declare for every file (see `TypescriptCompiler.globalDeclarationTexts`), with `globalThis`,
 * which the compiler knows without declaring it, and those the repository installs (see
 * `TypescriptCompiler.repositoryDeclarations`), read once for all the readers.
 */
export function createTypescriptSourceReaders({
  typescriptCompiler,
}: {
  typescriptCompiler: TypescriptCompiler;
}): readonly SourceReader[] {
  let installed: ReadonlySet<string> | undefined;
  const byRoot = new Map<string, InstalledGlobals>();
  const readGlobals = (root: string): InstalledGlobals => {
    const known = byRoot.get(root);
    if (known !== undefined) return known;
    const compiler = typescriptCompiler.load();
    if (installed === undefined) {
      const names = new Set<string>(['globalThis']);
      collectGlobals(compiler, typescriptCompiler.globalDeclarationTexts(), names);
      installed = names;
    }
    const repository = typescriptCompiler.repositoryDeclarations(root);
    const names = new Set(installed);
    collectGlobals(compiler, repository.texts, names);
    const globals = { names, missing: repository.missing };
    byRoot.set(root, globals);
    return globals;
  };
  return languages.map(({ extensions, kind, javascript }) => ({
    extensions,
    since: typescriptReadersSince,
    read(text) {
      const compiler = typescriptCompiler.load();
      try {
        const file = compiler.createSourceFile(
          `source${extensions[0]}`,
          text,
          compiler.ScriptTarget.Latest,
          false,
          compiler.ScriptKind[kind],
        );
        return readFile(compiler, file, javascript);
      } catch (caught) {
        if (caught instanceof RangeError) {
          throw new SourceUnreadable({
            details: {
              reason: `the text nests deeper than the parser can follow: ${caught.message}`,
            },
            cause: caught,
          });
        }
        const problem = caught instanceof Error ? caught.message : String(caught);
        throw new SourceReaderFailed({ details: { reader: 'TypeScript', problem }, cause: caught });
      }
    },
    globals: readGlobals,
  }));
}
