import type ts from 'typescript';
import type { Compiler } from './declarations';

/**
 * The members a file gives its top-level names after declaring them, by the name and the member
 * path below it (`''` for the name itself, `a` for `Head.a`): those added by name, and the paths
 * whose members anything may be, as an element write by a computed key leaves them.
 */
export interface Expandos {
  added(head: string, path: string): ReadonlySet<string> | undefined;
  isOpen(head: string, path: string): boolean;
}

/** The key one member path of one name is recorded under. */
const keyOf = (head: string, path: string): string => `${head}\u0000${path}`;

/**
 * The member path an assignment target `target` writes: the identifier it starts from, the
 * segments it passes, a `prototype` dropped as an instance member is the shape's own, and how
 * many of them a literal names before a computed key, if one comes.
 */
function readTarget(
  compiler: Compiler,
  target: ts.Expression,
): { readonly root: ts.Expression; readonly segments: string[]; readonly computedAt?: number } {
  const reversed: (string | undefined)[] = [];
  let inner = target;
  while (compiler.isPropertyAccessExpression(inner) || compiler.isElementAccessExpression(inner)) {
    if (compiler.isPropertyAccessExpression(inner)) {
      reversed.push(inner.name.text);
    } else {
      const key = inner.argumentExpression;
      const literal =
        compiler.isStringLiteral(key) ||
        compiler.isNumericLiteral(key) ||
        compiler.isNoSubstitutionTemplateLiteral(key);
      reversed.push(literal ? key.text : undefined);
    }
    inner = inner.expression;
  }
  const written = reversed.reverse();
  const computed = written.indexOf(undefined);
  const segments = (computed === -1 ? written : written.slice(0, computed)).filter(
    (segment): segment is string => segment !== undefined && segment !== 'prototype',
  );
  return computed === -1
    ? { root: inner, segments }
    : { root: inner, segments, computedAt: computed };
}

/**
 * The name of the class whose `this` an assignment at `node` writes: the walk up passes arrow
 * functions and the class's own members, and stops at any other function, an object literal's
 * method among them, whose `this` is its own.
 */
function thisClass(
  compiler: Compiler,
  node: ts.Node,
  parents: ReadonlyMap<ts.Node, ts.Node>,
): string | undefined {
  for (let at = parents.get(node); at !== undefined; at = parents.get(at)) {
    if (compiler.isClassLike(at)) return at.name?.text;
    if (compiler.isArrowFunction(at)) continue;
    const parent = parents.get(at);
    const ofClass = parent !== undefined && compiler.isClassLike(parent);
    if (compiler.isFunctionLike(at) && !ofClass) return undefined;
  }
  return undefined;
}

/**
 * The {@link Expandos} of `nodes`, a file's, from each assignment (`=` or a compound one) to a
 * member of a name the file declares at its top level, the name not shadowed where it is
 * written (`inScope` says whether a scope below the top level declares it): `Head.x = …` adds
 * `x` to `Head`, `Head.a.b = …` adds `b` to `Head.a`, `Head['k'] = …` adds `k`, and a computed
 * key, `Head[k] = …`, or `Object.assign(Head, …)` leaves `Head`'s members open. `this.x = …`
 * in a method of a named class adds `x` to the class.
 */
export function listExpandos(
  compiler: Compiler,
  nodes: readonly ts.Node[],
  parents: ReadonlyMap<ts.Node, ts.Node>,
  inScope: (node: ts.Node, name: string) => boolean,
): Expandos {
  const added = new Map<string, Set<string>>();
  const open = new Set<string>();
  const record = (node: ts.Node, target: ts.Expression, opens: boolean): void => {
    const { root, segments, computedAt } = readTarget(compiler, target);
    let head: string | undefined;
    if (root.kind === compiler.SyntaxKind.ThisKeyword) head = thisClass(compiler, node, parents);
    else if (compiler.isIdentifier(root) && !inScope(node, root.text)) head = root.text;
    if (head === undefined) return;
    if (opens || computedAt !== undefined) {
      open.add(keyOf(head, segments.join('.')));
      return;
    }
    const name = segments.at(-1);
    if (name === undefined) return;
    const key = keyOf(head, segments.slice(0, -1).join('.'));
    added.set(key, new Set([...(added.get(key) ?? []), name]));
  };
  for (const node of nodes) {
    if (
      compiler.isBinaryExpression(node) &&
      node.operatorToken.kind >= compiler.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= compiler.SyntaxKind.LastAssignment &&
      (compiler.isPropertyAccessExpression(node.left) ||
        compiler.isElementAccessExpression(node.left))
    ) {
      record(node, node.left, false);
    }
    if (
      compiler.isCallExpression(node) &&
      compiler.isPropertyAccessExpression(node.expression) &&
      compiler.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Object' &&
      node.expression.name.text === 'assign'
    ) {
      const [first] = node.arguments;
      if (first !== undefined) record(node, first, true);
    }
  }
  return {
    added: (head, path) => added.get(keyOf(head, path)),
    isOpen: (head, path) => open.has(keyOf(head, path)),
  };
}
