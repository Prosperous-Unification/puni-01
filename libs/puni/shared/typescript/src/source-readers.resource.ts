import type { DocComment, SourceDeclaration, SourceReader } from '@puni/shared-checkout';
import ts from 'typescript';

/** The extensions the compiler parses alike, and how it parses them. */
const languages: readonly {
  readonly extensions: readonly string[];
  readonly kind: ts.ScriptKind;
}[] = [
  { extensions: ['.ts', '.mts', '.cts'], kind: ts.ScriptKind.TS },
  { extensions: ['.tsx'], kind: ts.ScriptKind.TSX },
  { extensions: ['.js', '.mjs', '.cjs'], kind: ts.ScriptKind.JS },
  { extensions: ['.jsx'], kind: ts.ScriptKind.JSX },
];

function parse(text: string, kind: ts.ScriptKind): ts.SourceFile {
  return ts.createSourceFile('source', text, ts.ScriptTarget.Latest, false, kind);
}

/** The text of a declaration's name, or `undefined` for a computed or private one. */
function nameOf(name: ts.Node | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/** Whether `node` carries the `export` modifier, and whether it carries `default`. */
function modifiersOf(node: ts.Node): { readonly exported: boolean; readonly isDefault: boolean } {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return {
    exported: modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword),
    isDefault: modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword),
  };
}

/** Every identifier a binding name binds, through destructuring. */
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

/** `expression` without the parentheses, `as` and `satisfies` around it. */
function unwrap(expression: ts.Expression): ts.Expression {
  let inner = expression;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

/** The named members of a class, interface, type literal, enum or object literal. */
function membersOf(node: ts.Node): readonly ts.NamedDeclaration[] {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.members;
  }
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) return node.type.members;
  if (ts.isObjectLiteralExpression(node)) return node.properties;
  return [];
}

/** One top-level name, the node whose members it has, and whether the file exports it. */
interface TopLevel {
  readonly name: string;
  readonly node: ts.Node;
  readonly owner: ts.Node;
  readonly exported: boolean;
}

/**
 * The top-level names `file` declares: functions, classes, interfaces, type aliases, enums,
 * namespaces and variables (each name a destructuring binds), with `default` for a default
 * export.
 */
function listTopLevel(file: ts.SourceFile): TopLevel[] {
  const listed: TopLevel[] = [];
  for (const statement of file.statements) {
    const { exported, isDefault } = modifiersOf(statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer =
          declaration.initializer === undefined ? declaration : unwrap(declaration.initializer);
        for (const name of bindingNames(declaration.name)) {
          listed.push({ name, node: declaration, owner: initializer, exported });
        }
      }
      continue;
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement)
    ) {
      const name = nameOf(statement.name);
      if (name !== undefined) listed.push({ name, node: statement, owner: statement, exported });
      if (isDefault) {
        listed.push({ name: 'default', node: statement, owner: statement, exported: true });
      }
    }
  }
  return listed;
}

/** The local names an `export { … }` list without a module exports. */
function listLocallyExported(file: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined) continue;
    const clause = statement.exportClause;
    if (clause === undefined || !ts.isNamedExports(clause)) continue;
    for (const element of clause.elements) {
      names.add((element.propertyName ?? element.name).text);
    }
  }
  return names;
}

function rangeOf(node: ts.Node, file: ts.SourceFile): SourceDeclaration['range'] {
  return { start: node.getStart(file), end: node.getEnd() };
}

/**
 * The declarations of `file` (see {@link SourceReader.declarations}): each top-level name, each
 * name an `export` list, `export … from` or `export default` gives, and `<Name>.<member>` for
 * each named member of an exported class, interface, type literal alias, enum or object literal
 * variable. A name may repeat, as overloads and accessors do.
 */
function declare(file: ts.SourceFile): SourceDeclaration[] {
  const declared: SourceDeclaration[] = [];
  const locallyExported = listLocallyExported(file);
  for (const { name, node, owner, exported } of listTopLevel(file)) {
    declared.push({ name, range: rangeOf(node, file) });
    if (!exported && !locallyExported.has(name)) continue;
    for (const member of membersOf(owner)) {
      const memberName = nameOf(member.name);
      if (memberName !== undefined) {
        declared.push({ name: `${name}.${memberName}`, range: rangeOf(member, file) });
      }
    }
  }
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals !== true) {
      declared.push({ name: 'default', range: rangeOf(statement, file) });
    }
    if (!ts.isExportDeclaration(statement)) continue;
    const clause = statement.exportClause;
    if (clause === undefined) continue;
    if (ts.isNamespaceExport(clause)) {
      declared.push({ name: clause.name.text, range: rangeOf(clause, file) });
      continue;
    }
    for (const element of clause.elements) {
      declared.push({ name: element.name.text, range: rangeOf(element, file) });
    }
  }
  return declared;
}

/** The names `file` imports: default, namespace and named bindings, by their local names. */
function listImported(file: ts.SourceFile): string[] {
  return file.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement)) return [];
    const clause = statement.importClause;
    if (clause === undefined) return [];
    const names = clause.name === undefined ? [] : [clause.name.text];
    const bindings = clause.namedBindings;
    if (bindings === undefined) return names;
    if (ts.isNamespaceImport(bindings)) return [...names, bindings.name.text];
    return [...names, ...bindings.elements.map((element) => element.name.text)];
  });
}

/** The text of the doc comment `raw` (`/** … *\/`), without its markers and leading `*`s. */
function cleanComment(raw: string): string {
  const lines = raw
    .slice(3, -2)
    .split('\n')
    .map((line, at) => (at === 0 ? line.trim() : line.replace(/^\s*\* ?/u, '').trimEnd()));
  while (lines.at(-1) === '') lines.pop();
  while (lines[0] === '') lines.shift();
  return lines.join('\n');
}

/**
 * The doc comments of `file`: every `/** … *\/` comment leading a node or the end of the file,
 * so one placed before a closing brace alone is not read.
 */
function listDocComments(file: ts.SourceFile): DocComment[] {
  const text = file.text;
  const seen = new Set<number>();
  const comments: DocComment[] = [];
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
      if (seen.has(range.pos) || range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      seen.add(range.pos);
      const raw = text.slice(range.pos, range.end);
      if (!raw.startsWith('/**') || raw === '/**/') continue;
      const line = file.getLineAndCharacterOfPosition(range.pos).line + 1;
      comments.push({ line, text: cleanComment(raw) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  visit(file.endOfFileToken);
  return comments.sort((left, right) => left.line - right.line);
}

/**
 * The {@link SourceReader}s of TypeScript and JavaScript, one per way the compiler parses a file
 * (TypeScript, TSX, JavaScript, JSX), each reading a text through the compiler's parser alone:
 * no program, no type checking and no other file, so an imported name is in scope as the
 * import spells it, whatever its module declares.
 */
export function createTypescriptSourceReaders(): readonly SourceReader[] {
  return languages.map(({ extensions, kind }) => ({
    extensions,
    declarations: (text) => declare(parse(text, kind)),
    docComments: (text) => listDocComments(parse(text, kind)),
    scope(text) {
      const file = parse(text, kind);
      return new Set([
        ...listTopLevel(file)
          .map(({ name }) => name)
          .filter((name) => name !== 'default'),
        ...listImported(file),
      ]);
    },
  }));
}
