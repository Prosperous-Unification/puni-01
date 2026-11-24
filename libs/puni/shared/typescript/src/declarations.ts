import type { SourceDeclaration } from '@puni/shared-checkout';
import type ts from 'typescript';

/** The compiler's module, as a reading is given it. */
export type Compiler = typeof ts;

/** The text of a declaration's name, or `undefined` for a computed or private one. */
export function nameOf(compiler: Compiler, name: ts.Node | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (
    compiler.isIdentifier(name) ||
    compiler.isStringLiteral(name) ||
    compiler.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

/** Whether `node` carries the `export` modifier, and whether it carries `default`. */
function modifiersOf(
  compiler: Compiler,
  node: ts.Node,
): { readonly exported: boolean; readonly isDefault: boolean } {
  const modifiers = compiler.canHaveModifiers(node) ? (compiler.getModifiers(node) ?? []) : [];
  return {
    exported: modifiers.some(({ kind }) => kind === compiler.SyntaxKind.ExportKeyword),
    isDefault: modifiers.some(({ kind }) => kind === compiler.SyntaxKind.DefaultKeyword),
  };
}

/** Every identifier a binding name binds, through destructuring. */
export function bindingNames(compiler: Compiler, name: ts.BindingName): string[] {
  if (compiler.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    compiler.isOmittedExpression(element) ? [] : bindingNames(compiler, element.name),
  );
}

/**
 * `expression` without the parentheses, `as` and `satisfies` around it, and the argument of an
 * `Object.freeze(…)` call.
 */
function unwrap(compiler: Compiler, expression: ts.Expression): ts.Expression {
  let inner = expression;
  for (;;) {
    if (
      compiler.isParenthesizedExpression(inner) ||
      compiler.isAsExpression(inner) ||
      compiler.isSatisfiesExpression(inner)
    ) {
      inner = inner.expression;
      continue;
    }
    const [argument] = compiler.isCallExpression(inner) ? inner.arguments : [];
    if (
      argument !== undefined &&
      compiler.isCallExpression(inner) &&
      inner.expression.getText() === 'Object.freeze'
    ) {
      inner = argument;
      continue;
    }
    return inner;
  }
}

/** A named member of a shape: its name and its node. */
export interface Member {
  readonly name: string;
  readonly node: ts.Node;
}

/** The members a shape is known to have, and whether that list is all of them. */
export interface Members {
  readonly listed: readonly Member[];
  /** False when the shape has members no one text lists: inherited, spread or of an unknown type. */
  readonly closed: boolean;
}

const unknownMembers: Members = { listed: [], closed: false };

/** `nodes` that have a name, as members. */
function named(compiler: Compiler, nodes: readonly ts.NamedDeclaration[]): Member[] {
  return nodes.flatMap((node) => {
    const name = nameOf(compiler, node.name);
    return name === undefined ? [] : [{ name, node }];
  });
}

/** The declaration a statement is, when it is one with a name of its own. */
function declarationOf(
  compiler: Compiler,
  statement: ts.Statement,
): ts.NamedDeclaration | undefined {
  return compiler.isFunctionDeclaration(statement) ||
    compiler.isClassDeclaration(statement) ||
    compiler.isInterfaceDeclaration(statement) ||
    compiler.isTypeAliasDeclaration(statement) ||
    compiler.isEnumDeclaration(statement) ||
    compiler.isModuleDeclaration(statement) ||
    compiler.isImportEqualsDeclaration(statement)
    ? statement
    : undefined;
}

/** The members of a class: its elements, and the properties its constructor's parameters declare. */
function classMembers(compiler: Compiler, node: ts.ClassLikeDeclaration): Members {
  const parameters = node.members
    .filter(compiler.isConstructorDeclaration)
    .flatMap((constructor) =>
      constructor.parameters.filter(
        (parameter) =>
          compiler.canHaveModifiers(parameter) &&
          (compiler.getModifiers(parameter) ?? []).length > 0,
      ),
    );
  return {
    listed: [...named(compiler, node.members), ...named(compiler, parameters)],
    closed: node.heritageClauses === undefined,
  };
}

/** The members of a type: those of each type literal it is, unites or intersects. */
function typeMembers(compiler: Compiler, type: ts.TypeNode): Members {
  if (compiler.isTypeLiteralNode(type))
    return { listed: named(compiler, type.members), closed: true };
  if (compiler.isUnionTypeNode(type) || compiler.isIntersectionTypeNode(type)) {
    const parts = type.types.map((part) => typeMembers(compiler, part));
    return {
      listed: parts.flatMap(({ listed }) => listed),
      closed: parts.every(({ closed }) => closed),
    };
  }
  return unknownMembers;
}

/** The names a namespace body exports, as members. */
function namespaceMembers(compiler: Compiler, node: ts.ModuleDeclaration): Members {
  const body = node.body;
  if (body === undefined || !compiler.isModuleBlock(body)) return unknownMembers;
  const listed = body.statements.flatMap((statement): Member[] => {
    if (!modifiersOf(compiler, statement).exported) return [];
    if (compiler.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        bindingNames(compiler, declaration.name).map((name) => ({ name, node: declaration })),
      );
    }
    const declaration = declarationOf(compiler, statement);
    return declaration === undefined ? [] : named(compiler, [declaration]);
  });
  return { listed, closed: true };
}

/** The members of the shape `node` declares (see {@link Members}). */
function membersOf(compiler: Compiler, node: ts.Node): Members {
  if (compiler.isClassDeclaration(node) || compiler.isClassExpression(node)) {
    return classMembers(compiler, node);
  }
  if (compiler.isInterfaceDeclaration(node)) {
    return { listed: named(compiler, node.members), closed: node.heritageClauses === undefined };
  }
  if (compiler.isEnumDeclaration(node))
    return { listed: named(compiler, node.members), closed: true };
  if (compiler.isTypeAliasDeclaration(node)) return typeMembers(compiler, node.type);
  if (compiler.isModuleDeclaration(node)) return namespaceMembers(compiler, node);
  if (compiler.isObjectLiteralExpression(node)) {
    return {
      listed: named(compiler, node.properties),
      closed: !node.properties.some(compiler.isSpreadAssignment),
    };
  }
  if (compiler.isFunctionDeclaration(node)) return { listed: [], closed: true };
  return unknownMembers;
}

/** One top-level name a file declares, the node declaring it, its members and whether it is exported. */
export interface TopLevel {
  readonly name: string;
  readonly node: ts.Node;
  readonly members: Members;
  readonly exported: boolean;
}

/** The name `exports.<name> = …` or `module.exports.<name> = …` assigns, if `statement` is one. */
function commonJsExport(compiler: Compiler, statement: ts.Statement): string | undefined {
  if (!compiler.isExpressionStatement(statement)) return undefined;
  const assignment = statement.expression;
  if (
    !compiler.isBinaryExpression(assignment) ||
    assignment.operatorToken.kind !== compiler.SyntaxKind.EqualsToken ||
    !compiler.isPropertyAccessExpression(assignment.left)
  ) {
    return undefined;
  }
  const owner = assignment.left.expression.getText();
  return owner === 'exports' || owner === 'module.exports' ? assignment.left.name.text : undefined;
}

/** The statements of `file`, and those of its `declare global` blocks. */
function listStatements(compiler: Compiler, file: ts.SourceFile): ts.Statement[] {
  return file.statements.flatMap((statement) => {
    if (
      compiler.isModuleDeclaration(statement) &&
      (statement.flags & compiler.NodeFlags.GlobalAugmentation) !== 0 &&
      statement.body !== undefined &&
      compiler.isModuleBlock(statement.body)
    ) {
      return [...statement.body.statements];
    }
    return [statement];
  });
}

/**
 * The top-level names `file` declares: functions, classes, interfaces, type aliases, enums,
 * namespaces, imports by `=` and variables (each name a destructuring binds), with `default`
 * for a default export; those of its `declare global` blocks; the names CommonJS assigns to
 * `exports`; and each `@typedef` and `@callback` of its doc comments. Declarations of one name
 * are listed each, as merged interfaces and a function with its namespace are.
 */
export function listTopLevel(
  compiler: Compiler,
  file: ts.SourceFile,
  docTexts: readonly string[],
): TopLevel[] {
  const listed: TopLevel[] = [];
  for (const statement of listStatements(compiler, file)) {
    const { exported, isDefault } = modifiersOf(compiler, statement);
    if (compiler.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        const members =
          initializer === undefined
            ? unknownMembers
            : membersOf(compiler, unwrap(compiler, initializer));
        for (const name of bindingNames(compiler, declaration.name)) {
          listed.push({ name, node: declaration, members, exported });
        }
      }
      continue;
    }
    const assigned = commonJsExport(compiler, statement);
    if (assigned !== undefined) {
      listed.push({ name: assigned, node: statement, members: unknownMembers, exported: true });
      continue;
    }
    const declaration = declarationOf(compiler, statement);
    if (declaration !== undefined) {
      const members = membersOf(compiler, statement);
      const name = nameOf(compiler, declaration.name);
      if (name !== undefined) listed.push({ name, node: statement, members, exported });
      if (isDefault) listed.push({ name: 'default', node: statement, members, exported: true });
    }
  }
  for (const text of docTexts) {
    for (const match of text.matchAll(
      /@(?:typedef|callback)\s+(?:\{[^}]*\}\s*)?([A-Za-z_$][\w$]*)/gu,
    )) {
      listed.push({ name: match[1] ?? '', node: file, members: unknownMembers, exported: true });
    }
  }
  return listed;
}

/** Each local name an `export { … }` list without a module exports, and the names it exports it as. */
function listLocallyExported(compiler: Compiler, file: ts.SourceFile): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const statement of file.statements) {
    if (!compiler.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined)
      continue;
    const clause = statement.exportClause;
    if (clause === undefined || !compiler.isNamedExports(clause)) continue;
    for (const element of clause.elements) {
      const local = (element.propertyName ?? element.name).text;
      names.set(local, [...(names.get(local) ?? []), element.name.text]);
    }
  }
  return names;
}

function rangeOf(node: ts.Node, file: ts.SourceFile): SourceDeclaration['range'] {
  return { start: node.getStart(file), end: node.getEnd() };
}

/**
 * The declarations of `file` (see `SourceReader.declarations`): each top-level name (see
 * {@link listTopLevel}), each name an `export` list, `export … from`, `export * as` or
 * `export default` gives, and `<Name>.<member>` for each listed member of what is exported,
 * under every name it is exported as. A name may repeat, as overloads and accessors do.
 */
export function declare(
  compiler: Compiler,
  file: ts.SourceFile,
  docTexts: readonly string[],
): SourceDeclaration[] {
  const declared: SourceDeclaration[] = [];
  const locallyExported = listLocallyExported(compiler, file);
  for (const { name, node, members, exported } of listTopLevel(compiler, file, docTexts)) {
    const names = [...(exported ? [name] : []), ...(locallyExported.get(name) ?? [])];
    declared.push({ name, exported: names.length > 0, range: rangeOf(node, file) });
    for (const as of names) {
      for (const member of members.listed) {
        declared.push({
          name: `${as}.${member.name}`,
          exported: true,
          range: rangeOf(member.node, file),
        });
      }
    }
  }
  for (const statement of file.statements) {
    if (compiler.isExportAssignment(statement) && statement.isExportEquals !== true) {
      declared.push({ name: 'default', exported: true, range: rangeOf(statement, file) });
    }
    if (!compiler.isExportDeclaration(statement)) continue;
    const clause = statement.exportClause;
    if (clause === undefined) continue;
    if (compiler.isNamespaceExport(clause)) {
      declared.push({ name: clause.name.text, exported: true, range: rangeOf(clause, file) });
      continue;
    }
    for (const element of clause.elements) {
      declared.push({ name: element.name.text, exported: true, range: rangeOf(element, file) });
    }
  }
  return declared;
}

/** The modules `file` re-exports whole, `export * from '<module>'`, as it names them. */
export function listReexports(compiler: Compiler, file: ts.SourceFile): string[] {
  return file.statements.flatMap((statement) =>
    compiler.isExportDeclaration(statement) &&
    statement.exportClause === undefined &&
    statement.moduleSpecifier !== undefined &&
    compiler.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

/** The names `file` imports: default, namespace and named bindings, by their local names. */
export function listImported(compiler: Compiler, file: ts.SourceFile): string[] {
  return file.statements.flatMap((statement) => {
    if (!compiler.isImportDeclaration(statement)) return [];
    const clause = statement.importClause;
    if (clause === undefined) return [];
    const names = clause.name === undefined ? [] : [clause.name.text];
    const bindings = clause.namedBindings;
    if (bindings === undefined) return names;
    if (compiler.isNamespaceImport(bindings)) return [...names, bindings.name.text];
    return [...names, ...bindings.elements.map((element) => element.name.text)];
  });
}
