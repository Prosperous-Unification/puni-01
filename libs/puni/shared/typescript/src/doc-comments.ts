import type { DocComment } from '@puni/shared-checkout';
import type ts from 'typescript';
import type { Compiler } from './declarations';

/** A doc comment as found: what `docComments` gives, the node it leads and that node's ancestors. */
export interface FoundComment extends DocComment {
  readonly owner: ts.Node;
  /** The ancestors of `owner`, outermost first. */
  readonly ancestors: readonly ts.Node[];
}

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
 * The doc comments of `file`: every `/** … *\/` comment leading a node or the end of the file,
 * the text of JSX aside, so one placed before a closing brace alone is not read.
 */
export function findDocComments(compiler: Compiler, file: ts.SourceFile): FoundComment[] {
  const text = file.text;
  const seen = new Set<number>();
  const comments: FoundComment[] = [];
  const visit = (node: ts.Node, ancestors: readonly ts.Node[]): void => {
    if (compiler.isJsxText(node)) return;
    for (const range of compiler.getLeadingCommentRanges(text, node.pos) ?? []) {
      if (seen.has(range.pos) || range.kind !== compiler.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      seen.add(range.pos);
      const raw = text.slice(range.pos, range.end);
      if (!raw.startsWith('/**') || raw === '/**/') continue;
      const opening = file.getLineAndCharacterOfPosition(range.pos).line + 1;
      const { text: cleaned, dropped } = cleanComment(raw);
      comments.push({ line: opening + dropped, text: cleaned, owner: node, ancestors });
    }
    const inner = [...ancestors, node];
    compiler.forEachChild(node, (child) => {
      visit(child, inner);
    });
  };
  visit(file, []);
  visit(file.endOfFileToken, [file]);
  return comments.sort((left, right) => left.line - right.line);
}

/** `text` with its fenced blocks and inline code spans blanked, its line breaks kept. */
function blankCode(text: string): string {
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/u.test(line)) {
        inFence = !inFence;
        return '';
      }
      if (inFence) return '';
      return line.replace(/`[^`]*`/gu, (code) => ' '.repeat(code.length));
    })
    .join('\n');
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
