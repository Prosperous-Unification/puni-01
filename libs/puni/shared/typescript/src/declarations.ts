import type { SourceDeclaration } from '@puni/shared-checkout';
import type ts from 'typescript';
import { inherit } from './inheritance';
import { listImportNames, listTypedefs } from './jsdoc-tags';

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
 * What gives `expression` its members: the expression without the parentheses, `as const` and
 * `satisfies` around it, and the argument of an `Object.freeze(…)` call; or the type `T` of an
 * `as T`, whose members the value then has.
 */
function unwrap(
  compiler: Compiler,
  file: ts.SourceFile,
  expression: ts.Expression,
): ts.Expression | ts.TypeNode {
  let inner = expression;
  for (;;) {
    if (compiler.isAsExpression(inner) && inner.type.getText(file) !== 'const') return inner.type;
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
      inner.expression.getText(file) === 'Object.freeze'
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
  /** Whether the shape is a function or a class, which has the members of every function. */
  readonly callable: boolean;
}

const unknownMembers: Members = { listed: [], closed: false, callable: false };

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

/** A shape's own members, and the names of the bases it extends, `undefined` for an unnamed one. */
export interface OwnMembers extends Members {
  readonly bases: readonly (string | undefined)[];
}

/** The names the `extends` clauses of a class or interface name, one per base. */
function baseNames(
  compiler: Compiler,
  clauses: ts.NodeArray<ts.HeritageClause> | undefined,
): (string | undefined)[] {
  return (clauses ?? [])
    .filter(({ token }) => token === compiler.SyntaxKind.ExtendsKeyword)
    .flatMap(({ types }) =>
      types.map(({ expression }) =>
        compiler.isIdentifier(expression) ? expression.text : undefined,
      ),
    );
}

/** The own members of a class: its elements, and the properties its constructor's parameters declare. */
function classMembers(compiler: Compiler, node: ts.ClassLikeDeclaration): OwnMembers {
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
    closed: true,
    callable: true,
    bases: baseNames(compiler, node.heritageClauses),
  };
}

/**
 * The members of a type: those of each type literal it is, unites or intersects, and, for a
 * reference by a plain name without type arguments, those of what that name declares at the
 * top level of the file, as a base it inherits (see `inherit`); a generic or qualified reference
 * names members no one text lists.
 */
function typeMembers(compiler: Compiler, type: ts.TypeNode): OwnMembers {
  if (compiler.isTypeLiteralNode(type)) {
    return { listed: named(compiler, type.members), closed: true, callable: false, bases: [] };
  }
  if (compiler.isUnionTypeNode(type) || compiler.isIntersectionTypeNode(type)) {
    const parts = type.types.map((part) => typeMembers(compiler, part));
    return {
      listed: parts.flatMap(({ listed }) => listed),
      closed: parts.every(({ closed }) => closed),
      callable: false,
      bases: parts.flatMap(({ bases }) => bases),
    };
  }
  if (
    compiler.isTypeReferenceNode(type) &&
    type.typeArguments === undefined &&
    compiler.isIdentifier(type.typeName)
  ) {
    return { listed: [], closed: true, callable: false, bases: [type.typeName.text] };
  }
  return { ...unknownMembers, bases: [] };
}

/** `shape`'s members as one text lists them: open when it has a base, which no one text resolves. */
function withoutBases({ bases, ...members }: OwnMembers): Members {
  return bases.length === 0 ? members : { ...members, closed: false };
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
  return { listed, closed: true, callable: false };
}

/** The own members of the shape `node` declares (see {@link Members}). */
function ownMembersOf(compiler: Compiler, node: ts.Node): OwnMembers {
  if (compiler.isTypeNode(node)) return typeMembers(compiler, node);
  if (compiler.isClassDeclaration(node) || compiler.isClassExpression(node)) {
    return classMembers(compiler, node);
  }
  if (compiler.isInterfaceDeclaration(node)) {
    return {
      listed: named(compiler, node.members),
      closed: true,
      callable: false,
      bases: baseNames(compiler, node.heritageClauses),
    };
  }
  const plain = (members: Members): OwnMembers => ({ ...members, bases: [] });
  if (compiler.isEnumDeclaration(node)) {
    return plain({ listed: named(compiler, node.members), closed: true, callable: false });
  }
  if (compiler.isTypeAliasDeclaration(node)) return typeMembers(compiler, node.type);
  if (compiler.isModuleDeclaration(node)) return plain(namespaceMembers(compiler, node));
  if (compiler.isObjectLiteralExpression(node)) {
    return plain({
      listed: named(compiler, node.properties),
      closed: !node.properties.some(compiler.isSpreadAssignment),
      callable: false,
    });
  }
  if (compiler.isFunctionLike(node)) return plain({ listed: [], closed: true, callable: true });
  return plain(unknownMembers);
}

/**
 * The members the member `node` of a shape has in turn, so a link may name a member of a member:
 * those of the type literal or object a property is given, of a nested namespace, class,
 * interface, enum or type, and those of every function for a method. Open (see {@link Members})
 * when no one text lists them, as a class or interface extending a base does.
 */
export function membersOfMember(compiler: Compiler, file: ts.SourceFile, node: ts.Node): Members {
  if (
    compiler.isPropertySignature(node) ||
    compiler.isPropertyDeclaration(node) ||
    compiler.isVariableDeclaration(node)
  ) {
    if (node.type !== undefined) return withoutBases(typeMembers(compiler, node.type));
    const initializer = compiler.isPropertySignature(node) ? undefined : node.initializer;
    return initializer === undefined
      ? unknownMembers
      : membersOfMember(compiler, file, unwrap(compiler, file, initializer));
  }
  if (compiler.isPropertyAssignment(node)) {
    return membersOfMember(compiler, file, unwrap(compiler, file, node.initializer));
  }
  if (compiler.isTypeNode(node)) return withoutBases(typeMembers(compiler, node));
  if (
    compiler.isClassDeclaration(node) ||
    compiler.isClassExpression(node) ||
    compiler.isInterfaceDeclaration(node) ||
    compiler.isEnumDeclaration(node) ||
    compiler.isTypeAliasDeclaration(node) ||
    compiler.isModuleDeclaration(node) ||
    compiler.isObjectLiteralExpression(node) ||
    compiler.isFunctionLike(node)
  ) {
    return withoutBases(ownMembersOf(compiler, node));
  }
  return unknownMembers;
}

/** One top-level name a file declares, the node declaring it, its members and how it is declared. */
export interface TopLevel {
  readonly name: string;
  readonly node: ts.Node;
  readonly members: Members;
  readonly exported: boolean;
  /** Whether a `declare global` block declares it, for every file rather than this one. */
  readonly global: boolean;
}

/** A top-level name before its members inherit those of its bases. */
export type RawTopLevel = Omit<TopLevel, 'members'> & { readonly own: OwnMembers };

/** The names `exports.<name> = …`, `module.exports.<name> = …` or `module.exports = { … }` assigns. */
function commonJsExports(
  compiler: Compiler,
  file: ts.SourceFile,
  statement: ts.Statement,
): string[] {
  if (!compiler.isExpressionStatement(statement)) return [];
  const assignment = statement.expression;
  if (
    !compiler.isBinaryExpression(assignment) ||
    assignment.operatorToken.kind !== compiler.SyntaxKind.EqualsToken
  ) {
    return [];
  }
  if (assignment.left.getText(file) === 'module.exports') {
    const right = unwrap(compiler, file, assignment.right);
    return compiler.isObjectLiteralExpression(right)
      ? named(compiler, right.properties).map(({ name }) => name)
      : [];
  }
  if (!compiler.isPropertyAccessExpression(assignment.left)) return [];
  const owner = assignment.left.expression.getText(file);
  return owner === 'exports' || owner === 'module.exports' ? [assignment.left.name.text] : [];
}

/** Whether `statement` is a `declare global { … }` block, or `global { … }` inside a module. */
export function isGlobalBlock(
  compiler: Compiler,
  statement: ts.Statement,
): statement is ts.ModuleDeclaration & { readonly body: ts.ModuleBlock } {
  return (
    compiler.isModuleDeclaration(statement) &&
    (statement.flags & compiler.NodeFlags.GlobalAugmentation) !== 0 &&
    statement.body !== undefined &&
    compiler.isModuleBlock(statement.body)
  );
}

/** The statements of `file` with whether each stands in a `declare global` block. */
function listStatements(
  compiler: Compiler,
  file: ts.SourceFile,
): { readonly statement: ts.Statement; readonly global: boolean }[] {
  return file.statements.flatMap(
    (statement): { readonly statement: ts.Statement; readonly global: boolean }[] =>
      isGlobalBlock(compiler, statement)
        ? statement.body.statements.map((inner) => ({ statement: inner, global: true }))
        : [{ statement, global: false }],
  );
}

/**
 * The top-level names `file` declares: functions, classes, interfaces, type aliases, enums,
 * namespaces, imports by `=` and variables (each name a destructuring binds), with `default`
 * for a default export; those of its `declare global` blocks, marked global; the names CommonJS
 * assigns to `exports`; and, in a JavaScript file (`javascript`), each name a `@typedef`,
 * `@callback` or `@import` tag of `docTexts`, its doc comments, declares. A shape has its own members and those of the
 * bases the file declares (see `inherit`). Declarations of one name are listed each, as merged
 * interfaces and a function with its namespace are.
 */
export function listTopLevel(
  compiler: Compiler,
  file: ts.SourceFile,
  docTexts: readonly string[],
  javascript: boolean,
): TopLevel[] {
  const raw: RawTopLevel[] = [];
  const unknown: OwnMembers = { ...unknownMembers, bases: [] };
  for (const { statement, global } of listStatements(compiler, file)) {
    const { exported, isDefault } = modifiersOf(compiler, statement);
    if (compiler.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const { initializer, type } = declaration;
        const own =
          type !== undefined
            ? ownMembersOf(compiler, type)
            : initializer === undefined
              ? unknown
              : ownMembersOf(compiler, unwrap(compiler, file, initializer));
        for (const name of bindingNames(compiler, declaration.name)) {
          raw.push({ name, node: declaration, own, exported, global });
        }
      }
      continue;
    }
    for (const name of commonJsExports(compiler, file, statement)) {
      raw.push({ name, node: statement, own: unknown, exported: true, global });
    }
    const declaration = declarationOf(compiler, statement);
    if (declaration === undefined) continue;
    const own = ownMembersOf(compiler, statement);
    const name = nameOf(compiler, declaration.name);
    if (name !== undefined) raw.push({ name, node: statement, own, exported, global });
    if (isDefault) raw.push({ name: 'default', node: statement, own, exported: true, global });
  }
  if (javascript) {
    for (const name of docTexts.flatMap((text) => [
      ...listTypedefs(text),
      ...listImportNames(text),
    ])) {
      raw.push({ name, node: file, own: unknown, exported: true, global: false });
    }
  }
  return inherit(raw);
}

/** Each local name an `export { … }` list without a module exports, and the names it exports it as. */
function listLocallyExported(compiler: Compiler, file: ts.SourceFile): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const statement of file.statements) {
    if (!compiler.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined) {
      continue;
    }
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
 * The declarations of `file` (see `SourceReading.declarations`) from its top-level names (see
 * {@link listTopLevel}): each of them, each name an `export` list, `export … from`,
 * `export * as` or `export default` gives, those passed on from another module marked
 * re-exported, and `<Name>.<member>` for each listed member of what is exported, under every
 * name it is exported as. A name may repeat, as overloads and accessors do.
 */
export function declare(
  compiler: Compiler,
  file: ts.SourceFile,
  topLevel: readonly TopLevel[],
): SourceDeclaration[] {
  const declared: SourceDeclaration[] = [];
  const locallyExported = listLocallyExported(compiler, file);
  const add = (name: string, node: ts.Node, exported: boolean, reexported = false): void => {
    declared.push({ name, exported, reexported, range: rangeOf(node, file) });
  };
  for (const { name, node, members, exported } of topLevel) {
    const names = [...(exported ? [name] : []), ...(locallyExported.get(name) ?? [])];
    add(name, node, names.length > 0);
    for (const as of names) {
      for (const member of members.listed) add(`${as}.${member.name}`, member.node, true);
    }
  }
  for (const statement of file.statements) {
    if (compiler.isExportAssignment(statement) && statement.isExportEquals !== true) {
      add('default', statement, true);
    }
    if (!compiler.isExportDeclaration(statement)) continue;
    const clause = statement.exportClause;
    if (clause === undefined) continue;
    const passedOn = statement.moduleSpecifier !== undefined;
    if (compiler.isNamespaceExport(clause)) {
      add(clause.name.text, clause, true, passedOn);
      continue;
    }
    for (const element of clause.elements) add(element.name.text, element, true, passedOn);
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
