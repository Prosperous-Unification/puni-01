import type ts from 'typescript';
import {
  bindingNames,
  type Compiler,
  isGlobalBlock,
  type Members,
  membersOfMember,
  nameOf,
  type TopLevel,
} from './declarations';

/** The names the members of every function have, which a class or function is linked by too. */
const functionMembers: ReadonlySet<string> = new Set([
  'prototype',
  'name',
  'length',
  'call',
  'apply',
  'bind',
  'toString',
  'arguments',
  'caller',
]);

/** The names a statement declares in the block it stands in. */
function statementNames(compiler: Compiler, statement: ts.Statement): string[] {
  if (compiler.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      bindingNames(compiler, declaration.name),
    );
  }
  if (
    compiler.isFunctionDeclaration(statement) ||
    compiler.isClassDeclaration(statement) ||
    compiler.isInterfaceDeclaration(statement) ||
    compiler.isTypeAliasDeclaration(statement) ||
    compiler.isEnumDeclaration(statement) ||
    compiler.isImportEqualsDeclaration(statement)
  ) {
    const name = nameOf(compiler, statement.name);
    return name === undefined ? [] : [name];
  }
  if (compiler.isModuleDeclaration(statement)) {
    return compiler.isIdentifier(statement.name) ? [statement.name.text] : [];
  }
  if (compiler.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause === undefined) return [];
    const bindings = clause.namedBindings;
    const bound =
      bindings === undefined
        ? []
        : compiler.isNamespaceImport(bindings)
          ? [bindings.name.text]
          : bindings.elements.map((element) => element.name.text);
    return [...(clause.name === undefined ? [] : [clause.name.text]), ...bound];
  }
  return [];
}

/** The names the statements of one block declare in it. */
function blockNames(compiler: Compiler, statements: readonly ts.Statement[]): string[] {
  return statements.flatMap((statement) => statementNames(compiler, statement));
}

/** The names of the named members of `members`. */
function memberNames(compiler: Compiler, members: readonly ts.NamedDeclaration[]): string[] {
  return members.flatMap((member) => nameOf(compiler, member.name) ?? []);
}

/** The names the type parameters of `node` declare, if it has any. */
function typeParameterNames(compiler: Compiler, node: ts.Node): string[] {
  const parameters =
    compiler.isFunctionLike(node) ||
    compiler.isClassLike(node) ||
    compiler.isInterfaceDeclaration(node) ||
    compiler.isTypeAliasDeclaration(node)
      ? node.typeParameters
      : undefined;
  return (parameters ?? []).map((parameter) => parameter.name.text);
}

/** The properties the parameters of a class's constructor declare by a modifier. */
function parameterProperties(compiler: Compiler, node: ts.ClassLikeDeclaration): string[] {
  return node.members.flatMap((member) =>
    compiler.isConstructorDeclaration(member)
      ? member.parameters.flatMap((parameter) =>
          compiler.canHaveModifiers(parameter) &&
          (compiler.getModifiers(parameter) ?? []).length > 0
            ? bindingNames(compiler, parameter.name)
            : [],
        )
      : [],
  );
}

/** The variables a `for` loop's initializer declares. */
function loopNames(compiler: Compiler, node: ts.Node): string[] {
  if (
    !compiler.isForStatement(node) &&
    !compiler.isForInStatement(node) &&
    !compiler.isForOfStatement(node)
  ) {
    return [];
  }
  const initializer = node.initializer;
  if (initializer === undefined || !compiler.isVariableDeclarationList(initializer)) return [];
  return initializer.declarations.flatMap((declaration) =>
    bindingNames(compiler, declaration.name),
  );
}

/**
 * The names `node` puts in scope for what stands in it, a doc comment of it among them: the
 * parameters and type parameters of a function, the locals of a block, a loop's initializer and
 * a catch clause's variable, the members of a class (its constructor's parameter properties
 * among them), interface, type literal, object literal or enum, and the statements of a
 * namespace. A function or class expression puts its own name there too.
 */
function scopeNames(compiler: Compiler, node: ts.Node): string[] {
  const names = [...typeParameterNames(compiler, node), ...loopNames(compiler, node)];
  if (compiler.isFunctionLike(node)) {
    names.push(...node.parameters.flatMap((parameter) => bindingNames(compiler, parameter.name)));
    if (compiler.isFunctionExpression(node) && node.name !== undefined) names.push(node.name.text);
  }
  if (
    compiler.isBlock(node) ||
    compiler.isModuleBlock(node) ||
    compiler.isCaseClause(node) ||
    compiler.isDefaultClause(node)
  ) {
    names.push(...blockNames(compiler, node.statements));
  }
  if (compiler.isCatchClause(node) && node.variableDeclaration !== undefined) {
    names.push(...bindingNames(compiler, node.variableDeclaration.name));
  }
  if (compiler.isClassLike(node)) {
    names.push(...memberNames(compiler, node.members), ...parameterProperties(compiler, node));
    if (compiler.isClassExpression(node) && node.name !== undefined) names.push(node.name.text);
  }
  if (compiler.isInterfaceDeclaration(node) || compiler.isTypeLiteralNode(node)) {
    names.push(...memberNames(compiler, node.members));
  }
  if (compiler.isObjectLiteralExpression(node)) {
    names.push(...memberNames(compiler, node.properties));
  }
  if (compiler.isEnumDeclaration(node)) names.push(...memberNames(compiler, node.members));
  return names;
}

/** `expression` without the parentheses, `as` and `satisfies` around it. */
function unwrapExpression(compiler: Compiler, expression: ts.Expression): ts.Expression {
  let inner = expression;
  while (
    compiler.isParenthesizedExpression(inner) ||
    compiler.isAsExpression(inner) ||
    compiler.isSatisfiesExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

/**
 * The nodes a doc comment leading `host` documents, as the compiler hands a comment on: `host`,
 * each declaration of a variable statement, the initializer of a variable, a property
 * declaration or a property assignment, the type of a property signature, and the value an
 * assignment statement or `export default` gives.
 */
function effectiveHosts(compiler: Compiler, host: ts.Node): ts.Node[] {
  const hosts: ts.Node[] = [];
  const add = (node: ts.Node): void => {
    hosts.push(node);
    if (
      (compiler.isVariableDeclaration(node) ||
        compiler.isPropertyDeclaration(node) ||
        compiler.isPropertyAssignment(node)) &&
      node.initializer !== undefined
    ) {
      hosts.push(unwrapExpression(compiler, node.initializer));
    }
    if (compiler.isPropertySignature(node) && node.type !== undefined) hosts.push(node.type);
  };
  add(host);
  if (compiler.isVariableStatement(host)) {
    for (const declaration of host.declarationList.declarations) add(declaration);
  }
  if (
    compiler.isExpressionStatement(host) &&
    compiler.isBinaryExpression(host.expression) &&
    host.expression.operatorToken.kind === compiler.SyntaxKind.EqualsToken
  ) {
    add(unwrapExpression(compiler, host.expression.right));
  }
  if (compiler.isExportAssignment(host)) add(unwrapExpression(compiler, host.expression));
  return hosts;
}

/** What a reading of one file resolves the links of its doc comments against. */
export interface LinkContext {
  readonly compiler: Compiler;
  readonly file: ts.SourceFile;
  /** The node each node of the file stands in. */
  readonly parents: ReadonlyMap<ts.Node, ts.Node>;
  /** The names the file declares at its top level: its statements, imports and global blocks. */
  readonly topNames: ReadonlySet<string>;
  readonly topLevel: readonly TopLevel[];
  /** The names the file's doc comments declare by tag for the whole file (`@typedef`). */
  readonly tagged: ReadonlySet<string>;
  /** The names a `@template` tag of a JavaScript doc comment declares, by the node it leads. */
  readonly templates: ReadonlyMap<ts.Node, readonly string[]>;
}

/** Whether a scope a doc comment leading `host` sees declares `name`, the top level aside. */
function inScope(context: LinkContext, host: ts.Node, name: string): boolean {
  const { compiler, file, parents } = context;
  const declares = (node: ts.Node): boolean =>
    context.templates.get(node)?.includes(name) === true ||
    scopeNames(compiler, node).includes(name);
  if (effectiveHosts(compiler, host).some(declares)) return true;
  for (
    let node = parents.get(host);
    node !== undefined && node !== file;
    node = parents.get(node)
  ) {
    if (declares(node)) return true;
  }
  return false;
}

/** Whether the nearest class, interface or object literal holding `host` has the member `name`. */
function isEnclosingMember(context: LinkContext, host: ts.Node, name: string): boolean {
  const { compiler, file, parents } = context;
  for (
    let node: ts.Node | undefined = host;
    node !== undefined && node !== file;
    node = parents.get(node)
  ) {
    if (
      compiler.isClassLike(node) ||
      compiler.isInterfaceDeclaration(node) ||
      compiler.isObjectLiteralExpression(node)
    ) {
      return scopeNames(compiler, node).includes(name);
    }
  }
  return false;
}

/**
 * The members the top-level name `head` has, when the file pins them down: declared at the top
 * level outside a global block, as shapes whose members are all listed. A name a global block
 * declares may be merged into by any file.
 */
function closedMembersOf(context: LinkContext, head: string): Members | undefined {
  const parts = context.topLevel.filter(({ name }) => name === head);
  if (parts.length === 0 || parts.some(({ global }) => global)) return undefined;
  if (!parts.every(({ members }) => members.closed)) return undefined;
  return {
    listed: parts.flatMap(({ members }) => members.listed),
    closed: true,
    callable: parts.some(({ members }) => members.callable),
  };
}

/**
 * Whether each of `segments`, a member path below a shape with the members `members`, names a
 * member: of a shape the file lists whole, a listed member or, for a class or function, one
 * every function has; below a shape it does not list whole, anything.
 */
function resolvesMembers(
  context: LinkContext,
  members: Members | undefined,
  segments: readonly string[],
): boolean {
  let current = members;
  for (const segment of segments) {
    if (current === undefined || !current.closed || segment === '') return true;
    const found = current.listed.filter(({ name }) => name === segment);
    if (found.length === 0) return current.callable && functionMembers.has(segment);
    const inner = found.map(({ node }) => membersOfMember(context.compiler, context.file, node));
    current = inner.every(({ closed }) => closed)
      ? {
          listed: inner.flatMap(({ listed }) => listed),
          closed: true,
          callable: inner.some(({ callable }) => callable),
        }
      : undefined;
  }
  return true;
}

/** The name a link target names: before a type argument list, a call or an index after it. */
export function nameOfTarget(target: string): string {
  return /^[^<([]*/u.exec(target)?.[0] ?? '';
}

/**
 * Whether the doc comment leading `host` resolves the link target `target` itself. Its first
 * name is declared in a scope the comment sees (see `scopeNames`): one of the nodes it documents
 * (see `effectiveHosts`) or one they stand in, then the file's top level (its statements,
 * imports and global blocks) and the names its doc comments declare by tag. A name a scope
 * below the top level declares resolves whole; one the top level declares resolves when each
 * member after a `.` or `#` names a member (see `resolvesMembers`) of what it declares there.
 * `this.<member>` resolves when the member is one of the nearest enclosing class, interface or
 * object literal. A type argument list, call or index after the name is not judged.
 */
export function resolvesInFile(context: LinkContext, host: ts.Node, target: string): boolean {
  const [head = '', ...segments] = nameOfTarget(target).split(/[.#]/u);
  if (head === 'this') {
    const [member] = segments;
    return member !== undefined && isEnclosingMember(context, host, member);
  }
  if (inScope(context, host, head)) return true;
  if (context.topNames.has(head)) {
    return resolvesMembers(context, closedMembersOf(context, head), segments);
  }
  return context.tagged.has(head);
}

/** The name a link target starts with. */
export function headOf(target: string): string {
  return nameOfTarget(target).split(/[.#]/u)[0] ?? '';
}

/**
 * Whether a link target is one a doc comment's link is judged by: a name, a type argument list,
 * call or index after it allowed; not a URL or `module:` path, a path to a file, an anchor or an
 * `import(…)` type.
 */
export function isJudgedTarget(target: string): boolean {
  if (target.startsWith('import(')) return false;
  return /^[A-Za-z_$][\w$]*(?:[.#][\w$]*)*(?:[<([].*)?$/u.test(target);
}

/**
 * The names the file's top-level statements, imports and global blocks declare, a global block
 * inside a `declare module` block among them.
 */
export function listTopNames(compiler: Compiler, file: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    const inner = isGlobalBlock(compiler, statement) ? statement.body.statements : [statement];
    for (const name of blockNames(compiler, inner)) names.add(name);
  }
  for (const name of listAmbientNames(compiler, file, true)) names.add(name);
  return names;
}

/**
 * The names the `@template` tags of the doc comment `text` declare: `@template T, U`,
 * `@template {C} T` and `@template [T=D]` alike.
 */
export function listTemplateNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/^\s*@template(?:\s+\{[^}]*\})?\s+([^\n]*)/gmu)) {
    let rest = match[1] ?? '';
    for (;;) {
      const name = /^\s*\[?([A-Za-z_$][\w$]*)[^,\s]*\s*(,?)/u.exec(rest);
      if (name === null) break;
      names.push(name[1] ?? '');
      if (name[2] === '') break;
      rest = rest.slice(name[0].length);
    }
  }
  return names;
}

/**
 * The names statements declare for every file: none for an import, and none for a module named
 * by a string, which `statementNames` gives no name.
 */
function ambientNames(compiler: Compiler, statements: readonly ts.Statement[]): string[] {
  return statements.flatMap((statement) =>
    compiler.isImportDeclaration(statement) ? [] : statementNames(compiler, statement),
  );
}

/**
 * The names `file` declares for every file: each top-level name of a script, a file that is no
 * module (`isModule` says whether it is one, as a file using `require` or `module.exports` is),
 * and each name of a global block, `declare global { … }` at the top level or `global { … }`
 * inside a `declare module` block.
 */
export function listAmbientNames(
  compiler: Compiler,
  file: ts.SourceFile,
  isModule: boolean,
): string[] {
  const names: string[] = [];
  for (const statement of file.statements) {
    if (isGlobalBlock(compiler, statement)) {
      names.push(...ambientNames(compiler, statement.body.statements));
      continue;
    }
    if (
      compiler.isModuleDeclaration(statement) &&
      compiler.isStringLiteral(statement.name) &&
      statement.body !== undefined &&
      compiler.isModuleBlock(statement.body)
    ) {
      for (const inner of statement.body.statements) {
        if (isGlobalBlock(compiler, inner)) {
          names.push(...ambientNames(compiler, inner.body.statements));
        }
      }
      continue;
    }
    if (!isModule) names.push(...ambientNames(compiler, [statement]));
  }
  return names;
}

/**
 * Whether `nodes`, a file's, use CommonJS, which makes the file a module: a call of `require`,
 * or `module.exports` or `exports.<name>`.
 */
export function usesCommonJs(compiler: Compiler, nodes: readonly ts.Node[]): boolean {
  return nodes.some(
    (node) =>
      (compiler.isCallExpression(node) &&
        compiler.isIdentifier(node.expression) &&
        node.expression.text === 'require') ||
      (compiler.isPropertyAccessExpression(node) &&
        compiler.isIdentifier(node.expression) &&
        ((node.expression.text === 'module' && node.name.text === 'exports') ||
          node.expression.text === 'exports')),
  );
}
