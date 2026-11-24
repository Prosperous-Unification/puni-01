import type { DocLink, SourceReader } from '@puni/shared-checkout';
import type ts from 'typescript';
import type { TypescriptCompiler } from './contract';
import { type Compiler, declare, listReexports, listTopLevel } from './declarations';
import { findDocComments, listLinkTags } from './doc-comments';
import { isJudgedTarget, readGlobalNames, resolvesLink } from './link-scopes';

/** The rules epoch from which the TypeScript and JavaScript readers are read. */
export const typescriptReadersSince = 3;

/** The extensions the compiler parses alike, and the script kind it parses them as. */
const languages = [
  { extensions: ['.ts', '.mts', '.cts'], kind: 'TS' },
  { extensions: ['.tsx'], kind: 'TSX' },
  { extensions: ['.js', '.mjs', '.cjs'], kind: 'JS' },
  { extensions: ['.jsx'], kind: 'JSX' },
] as const;

/** The links of `file` (see `SourceReader.links`), each judged by {@link resolvesLink}. */
function readLinks(
  compiler: Compiler,
  file: ts.SourceFile,
  globals: () => ReadonlySet<string>,
): DocLink[] {
  const comments = findDocComments(compiler, file);
  const topLevel = listTopLevel(
    compiler,
    file,
    comments.map(({ text }) => text),
  );
  const context = { compiler, file, topLevel, globals };
  return comments.flatMap(({ line, text, owner, ancestors }) =>
    listLinkTags(text)
      .filter(({ target }) => isJudgedTarget(target))
      .map(({ target, offset }) => ({
        target,
        line: line + offset,
        resolves: resolvesLink(context, owner, ancestors, target),
      })),
  );
}

/**
 * The {@link SourceReader}s of TypeScript and JavaScript, read from rules epoch
 * {@link typescriptReadersSince}, one per way the compiler parses a file (TypeScript, TSX,
 * JavaScript, JSX), each reading a text through the compiler's parser alone: no program, no
 * type checking and no other file, so an imported name resolves as the import spells it,
 * whatever its module declares. The compiler is loaded on the first reading, and the global
 * declarations on the first link no name of the file resolves.
 */
export function createTypescriptSourceReaders({
  typescriptCompiler,
}: {
  typescriptCompiler: TypescriptCompiler;
}): readonly SourceReader[] {
  let globals: ReadonlySet<string> | undefined;
  const readGlobals = (): ReadonlySet<string> => {
    globals ??= readGlobalNames(
      typescriptCompiler.load(),
      typescriptCompiler.globalDeclarationTexts(),
    );
    return globals;
  };
  return languages.map(({ extensions, kind }) => {
    const parse = (text: string): { compiler: Compiler; file: ts.SourceFile } => {
      const compiler = typescriptCompiler.load();
      const file = compiler.createSourceFile(
        `source${extensions[0]}`,
        text,
        compiler.ScriptTarget.Latest,
        true,
        compiler.ScriptKind[kind],
      );
      return { compiler, file };
    };
    return {
      extensions,
      since: typescriptReadersSince,
      declarations(text) {
        const { compiler, file } = parse(text);
        const docTexts = findDocComments(compiler, file).map((comment) => comment.text);
        return declare(compiler, file, docTexts);
      },
      reexports(text) {
        const { compiler, file } = parse(text);
        return listReexports(compiler, file);
      },
      docComments(text) {
        const { compiler, file } = parse(text);
        return findDocComments(compiler, file).map(({ line, text: comment }) => ({
          line,
          text: comment,
        }));
      },
      links(text) {
        const { compiler, file } = parse(text);
        return readLinks(compiler, file, readGlobals);
      },
    };
  });
}
