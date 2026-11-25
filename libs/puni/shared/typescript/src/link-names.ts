import type ts from 'typescript';
import {
  bindingNames,
  type Compiler,
  isGlobalBlock,
  type Members,
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

/** The name a node declares, if it is a declaration this reader counts. */
function declaredName(compiler: Compiler, node: ts.Node): string | undefined {
  if (
    compiler.isVariableDeclaration(node) ||
    compiler.isParameter(node) ||
    compiler.isBindingElement(node)
  ) {
    return compiler.isIdentifier(node.name) ? node.name.text : undefined;
  }
  if (
    compiler.isTypeParameterDeclaration(node) ||
    compiler.isFunctionDeclaration(node) ||
    compiler.isFunctionExpression(node) ||
    compiler.isClassDeclaration(node) ||
    compiler.isClassExpression(node) ||
    compiler.isInterfaceDeclaration(node) ||
    compiler.isTypeAliasDeclaration(node) ||
    compiler.isEnumDeclaration(node) ||
    compiler.isEnumMember(node) ||
    compiler.isModuleDeclaration(node) ||
    compiler.isPropertyDeclaration(node) ||
    compiler.isMethodDeclaration(node) ||
    compiler.isGetAccessorDeclaration(node) ||
    compiler.isSetAccessorDeclaration(node) ||
    compiler.isPropertySignature(node) ||
    compiler.isMethodSignature(node) ||
    compiler.isPropertyAssignment(node) ||
    compiler.isShorthandPropertyAssignment(node) ||
    compiler.isImportClause(node) ||
    compiler.isImportSpecifier(node) ||
    compiler.isNamespaceImport(node) ||
    compiler.isImportEqualsDeclaration(node)
  ) {
    return nameOf(compiler, node.name);
  }
  return undefined;
}

/**
 * How often each name is declared anywhere in `nodes`, the nodes of one file: parameters, type
 * parameters, variables at any depth (loop and catch variables among them), functions, classes,
 * interfaces, types, enums and their members, namespaces, class, interface and object members,
 * and the bindings of imports.
 */
export function countDeclaredNames(
  compiler: Compiler,
  nodes: readonly ts.Node[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const name = declaredName(compiler, node);
    if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** What a reading of one file resolves the links of its doc comments against. */
export interface LinkContext {
  readonly declared: ReadonlyMap<string, number>;
  readonly topLevel: readonly TopLevel[];
  /** The names the file's doc comments declare by tag, which no node declares. */
  readonly tagged: ReadonlySet<string>;
}

/**
 * The members `head` has, when the file pins them down: `head` is declared only at the top
 * level, outside a global block, as shapes whose members are all listed.
 */
function closedMembersOf(context: LinkContext, head: string): Members | undefined {
  const parts = context.topLevel.filter(({ name }) => name === head);
  if (parts.length === 0 || parts.some(({ global }) => global)) return undefined;
  const declaredElsewhere = (context.declared.get(head) ?? 0) > parts.length;
  if (declaredElsewhere || !parts.every(({ members }) => members.closed)) return undefined;
  return {
    listed: parts.flatMap(({ members }) => members.listed),
    closed: true,
    callable: parts.some(({ members }) => members.callable),
  };
}

/**
 * Whether the file itself resolves the link target `target`: its first name is declared
 * anywhere in the file, or named by a tag of its doc comments; and, when the file pins down the
 * members of that name (see `closedMembersOf`), the member after a `.` or `#` is one of them,
 * or, for a class or function, one every function has. `this.<member>` resolves when the
 * member is declared anywhere in the file. A type argument list after the name is ignored.
 */
export function resolvesInFile(context: LinkContext, target: string): boolean {
  const [head = '', member] = target.replace(/<.*$/u, '').split(/[.#]/u);
  if (head === 'this') return member !== undefined && context.declared.has(member);
  if (!context.declared.has(head) && !context.tagged.has(head)) return false;
  const members = closedMembersOf(context, head);
  if (members === undefined || member === undefined || member === '') return true;
  if (members.callable && functionMembers.has(member)) return true;
  return members.listed.some(({ name }) => name === member);
}

/** The name a link target starts with. */
export function headOf(target: string): string {
  return target.replace(/<.*$/u, '').split(/[.#]/u)[0] ?? '';
}

/**
 * Whether a link target is one a doc comment's link is judged by: a name, not a URL or
 * `module:` path, a path to a file or an anchor.
 */
export function isJudgedTarget(target: string): boolean {
  return /^[A-Za-z_$][\w$]*(?:[.#][\w$]*)*(?:<.*)?$/u.test(target);
}

/** The names the statements of one block declare. */
function statementNames(compiler: Compiler, statements: readonly ts.Statement[]): string[] {
  return statements.flatMap((statement): string[] => {
    if (compiler.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        bindingNames(compiler, declaration.name),
      );
    }
    const name = declaredName(compiler, statement);
    if (name === undefined) return [];
    const isModuleName =
      compiler.isModuleDeclaration(statement) && compiler.isStringLiteral(statement.name);
    return isModuleName ? [] : [name];
  });
}

/**
 * The names `file` declares for every file: each top-level name of a script, which is no
 * module, and each name of a global block, `declare global { … }` at the top level or
 * `global { … }` inside a `declare module` block.
 */
export function listAmbientNames(compiler: Compiler, file: ts.SourceFile): string[] {
  const names: string[] = [];
  const isModule = compiler.isExternalModule(file);
  for (const statement of file.statements) {
    if (isGlobalBlock(compiler, statement)) {
      names.push(...statementNames(compiler, statement.body.statements));
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
          names.push(...statementNames(compiler, inner.body.statements));
        }
      }
      continue;
    }
    if (!isModule) names.push(...statementNames(compiler, [statement]));
  }
  return names;
}
