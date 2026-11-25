import type { SourceReader, SourceReading } from '@puni/shared-checkout';
import type ts from 'typescript';
import type { TypescriptCompiler } from './contract';
import { type Compiler, declare, listReexports, listTopLevel } from './declarations';
import { findDocComments, listLinkTags, listNodes } from './doc-comments';
import {
  countDeclaredNames,
  headOf,
  isJudgedTarget,
  listAmbientNames,
  resolvesInFile,
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
  const nodes = listNodes(compiler, file);
  const docComments = findDocComments(compiler, file, nodes);
  const texts = docComments.map(({ text }) => text);
  const topLevel = listTopLevel(compiler, file, texts, javascript);
  const context = {
    declared: countDeclaredNames(compiler, nodes),
    topLevel,
    tagged: new Set(topLevel.filter(({ node }) => node === file).map(({ name }) => name)),
  };
  return {
    declarations: declare(compiler, file, topLevel),
    reexports: listReexports(compiler, file),
    docComments,
    links: docComments.flatMap(({ line, text }) =>
      listLinkTags(text)
        .filter(({ target }) => isJudgedTarget(target))
        .map(({ target, offset }) => ({
          target,
          line: line + offset,
          head: headOf(target),
          resolved: resolvesInFile(context, target),
        })),
    ),
    ambient: listAmbientNames(compiler, file),
  };
}

/**
 * The {@link SourceReader}s of TypeScript and JavaScript, read from rules epoch
 * {@link typescriptReadersSince}, one per way the compiler parses a file (TypeScript, TSX,
 * JavaScript, JSX), each reading a text in one pass of the compiler's parser alone: no program,
 * no type checking and no other file, the syntax tree dropped once read. The compiler is loaded
 * on the first reading; the globals, the names the global declarations the compiler finds
 * declare for every file (see `TypescriptCompiler.globalDeclarationTexts`), with `globalThis`,
 * which the compiler knows without declaring it, on the first ask, once for all the readers.
 */
export function createTypescriptSourceReaders({
  typescriptCompiler,
}: {
  typescriptCompiler: TypescriptCompiler;
}): readonly SourceReader[] {
  let globals: ReadonlySet<string> | undefined;
  const readGlobals = (): ReadonlySet<string> => {
    if (globals !== undefined) return globals;
    const compiler = typescriptCompiler.load();
    const names = new Set<string>(['globalThis']);
    for (const text of typescriptCompiler.globalDeclarationTexts()) {
      const file = compiler.createSourceFile('lib.d.ts', text, compiler.ScriptTarget.Latest, false);
      for (const name of listAmbientNames(compiler, file)) names.add(name);
    }
    globals = names;
    return globals;
  };
  return languages.map(({ extensions, kind, javascript }) => ({
    extensions,
    since: typescriptReadersSince,
    read(text) {
      const compiler = typescriptCompiler.load();
      const file = compiler.createSourceFile(
        `source${extensions[0]}`,
        text,
        compiler.ScriptTarget.Latest,
        false,
        compiler.ScriptKind[kind],
      );
      return readFile(compiler, file, javascript);
    },
    globals: readGlobals,
  }));
}
