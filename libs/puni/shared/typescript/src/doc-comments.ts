import { type DocComment, readMarkdown } from '@puni/shared-checkout';
import type ts from 'typescript';
import type { Compiler } from './declarations';

/**
 * The text of the doc comment `raw` (`/** … *\/`), without its markers and leading `*`s, and how
 * many of its lines were blank ones dropped before its first line of text.
 */
function cleanComment(raw: string): { readonly text: string; readonly dropped: number } {
  const lines = raw
    .slice(3, -2)
    .split('\n')
    .map((line, at) => (at === 0 ? line.trim() : line.replace(/^\s*\* ?/u, '').trimEnd()));
  while (lines.at(-1) === '') lines.pop();
  let dropped = 0;
  while (lines[0] === '') {
    lines.shift();
    dropped += 1;
  }
  return { text: lines.join('\n'), dropped };
}

/**
 * Every node of `file`, depth first, with the node each stands in, walked without recursion, so
 * a deeply nested expression cannot exhaust the stack.
 */
export function listNodes(
  compiler: Compiler,
  file: ts.SourceFile,
): { readonly nodes: ts.Node[]; readonly parents: ReadonlyMap<ts.Node, ts.Node> } {
  const nodes: ts.Node[] = [];
  const parents = new Map<ts.Node, ts.Node>();
  const stack: ts.Node[] = [file];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    nodes.push(node);
    const children: ts.Node[] = [];
    compiler.forEachChild(node, (child) => {
      children.push(child);
    });
    for (let at = children.length - 1; at >= 0; at -= 1) {
      const child = children[at];
      if (child === undefined) continue;
      parents.set(child, node);
      stack.push(child);
    }
  }
  return { nodes, parents };
}

/** One doc comment and the node it leads, the outermost one starting where the comment ends. */
export interface HostedComment {
  readonly comment: DocComment;
  readonly host: ts.Node;
}

/**
 * The doc comments of `nodes`, the nodes of `file` depth first: every `/** … *\/` comment leading
 * a node other than the file itself, the text of JSX aside, whose characters are no comment, so
 * one placed before a closing brace alone is not read; each with the outermost node it leads.
 */
export function findDocComments(
  compiler: Compiler,
  file: ts.SourceFile,
  nodes: readonly ts.Node[],
): HostedComment[] {
  const text = file.text;
  const seen = new Set<number>();
  const comments: HostedComment[] = [];
  for (const node of nodes) {
    if (node === file || compiler.isJsxText(node)) continue;
    for (const range of compiler.getLeadingCommentRanges(text, node.pos) ?? []) {
      if (seen.has(range.pos) || range.kind !== compiler.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      seen.add(range.pos);
      const raw = text.slice(range.pos, range.end);
      if (!raw.startsWith('/**') || raw === '/**/') continue;
      const opening = file.getLineAndCharacterOfPosition(range.pos).line + 1;
      const { text: cleaned, dropped } = cleanComment(raw);
      comments.push({ comment: { line: opening + dropped, text: cleaned }, host: node });
    }
  }
  return comments.sort((left, right) => left.comment.line - right.comment.line);
}

/** `text`, a doc comment's, with its code blocks, code spans and HTML comments blanked, its lines kept. */
function blankCode(text: string): string {
  const lines = text.split('\n').map(() => '');
  for (const { text: prose, line } of readMarkdown(text, { frontMatter: 'prose', comments: 'skip' })
    .prose)
    lines[line - 1] = prose;
  return lines.join('\n');
}

/** One inline link tag of a doc comment: its target as written and its line in the comment. */
export interface LinkTag {
  readonly target: string;
  /** The 0-based line of the tag within the comment's text. */
  readonly offset: number;
}

/**
 * The inline link tags of a doc comment's `text` outside its code: each `{@link …}`,
 * `{@linkcode …}` and `{@linkplain …}` with a target, the target running to the first space,
 * `|` or `}`, a line break inside the tag allowed.
 */
export function listLinkTags(text: string): LinkTag[] {
  const blanked = blankCode(text);
  return [...blanked.matchAll(/\{@link(?:code|plain)?\s+([^\s|}]+)/gu)].map((match) => ({
    target: match[1] ?? '',
    offset: blanked.slice(0, match.index).split('\n').length - 1,
  }));
}
