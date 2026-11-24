import type ts from 'typescript';
import {
  bindingNames,
  type Compiler,
  listImported,
  type Members,
  nameOf,
  type TopLevel,
} from './declarations';

/** The names the statements of one block declare. */
function blockNames(compiler: Compiler, statements: readonly ts.Statement[]): string[] {
  return statements.flatMap((statement): string[] => {
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
      compiler.isModuleDeclaration(statement) ||
      compiler.isImportEqualsDeclaration(statement)
    ) {
      const name = nameOf(compiler, statement.name);
      return name === undefined ? [] : [name];
    }
    return [];
  });
}

/** The function a node is or, for a variable statement of one function, holds. */
function functionOf(compiler: Compiler, node: ts.Node): ts.SignatureDeclaration | undefined {
  if (compiler.isFunctionLike(node)) return node;
  if (!compiler.isVariableStatement(node)) return undefined;
  const [declaration, ...others] = node.declarationList.declarations;
  const initializer = declaration?.initializer;
  return others.length === 0 && initializer !== undefined && compiler.isFunctionLike(initializer)
    ? initializer
    : undefined;
}

/** The names a node opens to what it holds: parameters, type parameters, members, block names. */
function namesOpenedBy(compiler: Compiler, node: ts.Node): string[] {
  const names: string[] = [];
  const signature = functionOf(compiler, node);
  if (signature !== undefined) {
    for (const parameter of signature.parameters)
      names.push(...bindingNames(compiler, parameter.name));
    for (const parameter of signature.typeParameters ?? []) names.push(parameter.name.text);
  }
  if (
    compiler.isClassLike(node) ||
    compiler.isInterfaceDeclaration(node) ||
    compiler.isTypeAliasDeclaration(node)
  ) {
    for (const parameter of node.typeParameters ?? []) names.push(parameter.name.text);
  }
  if (compiler.isClassLike(node) || compiler.isInterfaceDeclaration(node)) {
    for (const member of node.members) {
      const name = nameOf(compiler, member.name);
      if (name !== undefined) names.push(name);
    }
  }
  if (compiler.isBlock(node) || compiler.isModuleBlock(node)) {
    names.push(...blockNames(compiler, node.statements));
  }
  if (compiler.isCatchClause(node) && node.variableDeclaration !== undefined) {
    names.push(...bindingNames(compiler, node.variableDeclaration.name));
  }
  return names;
}

/** What a reading of one file resolves links against. */
export interface LinkContext {
  readonly compiler: Compiler;
  readonly file: ts.SourceFile;
  readonly topLevel: readonly TopLevel[];
  /** The global names, read the first time a link needs them. */
  readonly globals: () => ReadonlySet<string>;
}

/** The members `head` has as the file declares it, merged over its declarations. */
function membersAt(topLevel: readonly TopLevel[], head: string): Members | undefined {
  const parts = topLevel.filter(({ name }) => name === head).map(({ members }) => members);
  if (parts.length === 0) return undefined;
  return {
    listed: parts.flatMap(({ listed }) => listed),
    closed: parts.every(({ closed }) => closed),
  };
}

/** Whether `members` holds `member`, or may: a list that is not closed holds anything. */
function holds(members: Members, member: string | undefined): boolean {
  if (member === undefined || member === '' || !members.closed) return true;
  return members.listed.some(({ name }) => name === member);
}

/**
 * Whether the link target `target` of a doc comment leading `owner` names something visible
 * there, as the compiler would resolve it: the names `owner` and its ancestors open (parameters,
 * type parameters, class and interface members, the names of each enclosing block), then the
 * file's top-level names and imports, then the globals, `globalThis` among them, which the
 * compiler knows without declaring it. `<Name>.<member>` and `<Name>#<member>`
 * resolve when `<Name>` does and, for a name the file declares at the top level, when its
 * declaration lists the member, unless it may have members no one text lists. `this.<member>`
 * names a member of the enclosing class. A type argument list after the name is ignored.
 */
export function resolvesLink(
  context: LinkContext,
  owner: ts.Node,
  ancestors: readonly ts.Node[],
  target: string,
): boolean {
  const { compiler, file, topLevel } = context;
  const [head = '', member] = target.replace(/<.*$/u, '').split(/[.#]/u);
  const chain = [...ancestors, owner];
  if (head === 'this') {
    const owningClass = [...chain].reverse().find((node) => compiler.isClassLike(node));
    return (
      owningClass !== undefined &&
      member !== undefined &&
      namesOpenedBy(compiler, owningClass).includes(member)
    );
  }
  if (chain.some((node) => node !== file && namesOpenedBy(compiler, node).includes(head))) {
    return true;
  }
  const declared = membersAt(topLevel, head);
  if (declared !== undefined) return holds(declared, member);
  if (listImported(compiler, file).includes(head)) return true;
  return head === 'globalThis' || context.globals().has(head);
}

/**
 * Whether a link target is one a doc comment's link is judged by: a name, not a URL, a module
 * path, a path to a file or an anchor.
 */
export function isJudgedTarget(target: string): boolean {
  return /^[A-Za-z_$][\w$]*(?:[.#][\w$]*)*(?:<.*)?$/u.test(target) && !target.includes(':');
}

/**
 * The global names of `texts`, the global declaration files: every top-level name of a file
 * that is no module, and every name of a `declare global` block of any file.
 */
export function readGlobalNames(compiler: Compiler, texts: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    const file = compiler.createSourceFile('lib.d.ts', text, compiler.ScriptTarget.Latest, false);
    const isModule = compiler.isExternalModule(file);
    for (const statement of file.statements) {
      if (
        compiler.isModuleDeclaration(statement) &&
        (statement.flags & compiler.NodeFlags.GlobalAugmentation) !== 0 &&
        statement.body !== undefined &&
        compiler.isModuleBlock(statement.body)
      ) {
        for (const name of blockNames(compiler, statement.body.statements)) names.add(name);
        continue;
      }
      if (!isModule) for (const name of blockNames(compiler, [statement])) names.add(name);
    }
  }
  return names;
}
