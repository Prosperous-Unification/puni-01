/** One inline code span of Markdown, its line, and the link whose text holds it, if any. */
export interface MarkdownSpan {
  readonly code: string;
  /** The 1-based line the span opens on. */
  readonly line: number;
  /** The index in `MarkdownReading.links` of the link whose text holds the span. */
  readonly link: number | undefined;
}

/**
 * One link of Markdown, inline or by reference: its destination as written, a `<…>` and a title
 * dropped; its line; and its text's one code span when the text is nothing else.
 */
export interface MarkdownLink {
  readonly destination: string;
  /** The 1-based line the link opens on. */
  readonly line: number;
  readonly code: string | undefined;
}

/** One line of Markdown, as code or as prose, with its 1-based line number. */
export interface MarkdownLine {
  readonly text: string;
  readonly line: number;
}

/**
 * What a Markdown text holds: its inline code spans, its links, the lines of its code blocks,
 * and the lines of its prose with every code span and HTML comment blanked to spaces.
 */
export interface MarkdownReading {
  readonly spans: readonly MarkdownSpan[];
  readonly links: readonly MarkdownLink[];
  readonly codeLines: readonly MarkdownLine[];
  readonly prose: readonly MarkdownLine[];
}

/**
 * How a Markdown text is read: its front matter, when it opens with `---`, and its HTML comments
 * either skipped, holding nothing, or read as `prose`, as the rules of epochs 1 and 2 read them.
 */
export interface MarkdownOptions {
  readonly frontMatter: 'skip' | 'prose';
  readonly comments: 'skip' | 'prose';
}

/** A reference definition's label as links match it: case-folded, its spaces collapsed. */
function foldLabel(label: string): string {
  return label.trim().replace(/\s+/gu, ' ').toUpperCase().toLowerCase();
}

const fenceOpener = /^(\s*)(`{3,}|~{3,})(.*)$/u;
const listItem = /^(\s*)(?:[-*+]|\d{1,9}[.)])(\s+|$)/u;
const definition = /^ {0,3}\[([^\]^][^\]]*)\]:\s*<?([^\s>]+)>?(?:\s+.*)?$/u;
const punctuation = /[!-/:-@[-`{-~]/u;

/** The indentation of `line`, a tab counting four spaces. */
function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
}

/** `line` without its first `columns` columns of indentation, a tab counting four. */
function dropIndent(line: string, columns: number): string {
  let width = 0;
  let at = 0;
  while (at < line.length && width < columns) {
    width += line[at] === '\t' ? 4 : 1;
    at += 1;
  }
  return line.slice(at);
}

/** A paragraph: its lines of text in order, each with its line number. */
type Paragraph = readonly MarkdownLine[];

/**
 * The blocks of `lines`: the paragraphs of prose, the lines of fenced and indented code, and the
 * reference definitions, whose labels go to `definitions`.
 *
 * A fence opens with three or more backticks or tildes indented at most three spaces past the
 * list item it stands in, and closes on a line of the same character, at least as many, and
 * nothing else. A line indented four spaces past that, after a blank line, is code. An HTML
 * comment opening a block runs to its `-->`, unless `comments` reads it as prose. A reference
 * definition may stand in a list item, indented as its text is. A footnote definition
 * (`[^1]: …`) is prose.
 */
function readBlocks(
  lines: readonly string[],
  first: number,
  definitions: Map<string, string>,
  comments: MarkdownOptions['comments'],
): { readonly paragraphs: Paragraph[]; readonly codeLines: MarkdownLine[] } {
  const paragraphs: Paragraph[] = [];
  const codeLines: MarkdownLine[] = [];
  let current: MarkdownLine[] = [];
  let fence: { readonly char: string; readonly length: number } | undefined;
  let listIndent: number | undefined;
  let inComment = false;
  const flush = (): void => {
    if (current.length > 0) paragraphs.push(current);
    current = [];
  };
  for (let at = first; at < lines.length; at += 1) {
    const text = lines[at] ?? '';
    const line = at + 1;
    if (fence !== undefined) {
      const closing = /^\s*(`{3,}|~{3,})\s*$/u.exec(text)?.[1];
      if (closing?.[0] === fence.char && closing.length >= fence.length) fence = undefined;
      else codeLines.push({ text, line });
      continue;
    }
    if (inComment) {
      if (text.includes('-->')) inComment = false;
      continue;
    }
    if (text.trim() === '') {
      flush();
      continue;
    }
    const indent = indentOf(text);
    const bullet = listItem.exec(text);
    if (
      listIndent !== undefined &&
      indent < listIndent &&
      bullet === null &&
      current.length === 0
    ) {
      listIndent = undefined;
    }
    const base = listIndent !== undefined && indent >= listIndent ? listIndent : 0;
    const opener = fenceOpener.exec(text);
    const marker = opener?.[2] ?? '';
    if (
      opener !== null &&
      indent - base <= 3 &&
      !(marker.startsWith('`') && (opener[3] ?? '').includes('`'))
    ) {
      flush();
      fence = { char: marker[0] ?? '`', length: marker.length };
      continue;
    }
    if (indent - base >= 4 && current.length === 0) {
      codeLines.push({ text, line });
      continue;
    }
    if (comments === 'skip' && current.length === 0 && text.trimStart().startsWith('<!--')) {
      inComment = !text.includes('-->');
      continue;
    }
    if (bullet !== null) {
      flush();
      listIndent = bullet[0].length;
    }
    const defined = current.length === 0 ? definition.exec(dropIndent(text, base)) : null;
    if (defined !== null) {
      definitions.set(foldLabel(defined[1] ?? ''), defined[2] ?? '');
      continue;
    }
    current.push({ text, line });
  }
  flush();
  return { paragraphs, codeLines };
}

/** The end of the backtick run at `start` in `text`, and the code span it opens, if it closes. */
function readCode(
  text: string,
  start: number,
): { readonly end: number; readonly code: string | undefined } {
  let run = start;
  while (text[run] === '`') run += 1;
  const ticks = text.slice(start, run);
  let search = run;
  for (;;) {
    const closing = text.indexOf(ticks, search);
    if (closing === -1) return { end: run, code: undefined };
    if (text[closing + ticks.length] === '`') {
      search = closing + ticks.length;
      while (text[search] === '`') search += 1;
      continue;
    }
    const raw = text.slice(run, closing).replace(/\n/gu, ' ');
    const code = /^ .*[^ ].* $/u.test(raw) ? raw.slice(1, -1) : raw;
    return { end: closing + ticks.length, code };
  }
}

/** The index of the `]` closing the link text opened at `open`, nested brackets and code skipped. */
function findTextEnd(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\' && punctuation.test(text[at + 1] ?? '')) {
      at += 1;
    } else if (char === '`') {
      at = readCode(text, at).end - 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** The inline destination opening at `open` (a `(`), and where it ends; nested parentheses allowed. */
function readDestination(
  text: string,
  open: number,
): { readonly end: number; readonly destination: string } | undefined {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\') {
      at += 1;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        const inside = text.slice(open + 1, at).trim();
        const destination = inside.startsWith('<')
          ? inside.slice(1, inside.indexOf('>'))
          : (inside.split(/\s+/u)[0] ?? '');
        return { end: at + 1, destination };
      }
    }
  }
  return undefined;
}

/** What the inline scan of one paragraph gathers. */
interface Found {
  readonly spans: MarkdownSpan[];
  readonly links: MarkdownLink[];
  /** The paragraph's text, each code span and HTML comment blanked. */
  readonly blanked: string[];
}

/**
 * The inline content of `text`, a paragraph or a link's text, from `offset` in its paragraph:
 * escapes, HTML comments, code spans and links, the spans of a link's text marked with it.
 */
function readInline(
  text: string,
  offset: number,
  lineAt: (offset: number) => number,
  definitions: ReadonlyMap<string, string>,
  link: number | undefined,
  found: Found,
  comments: MarkdownOptions['comments'],
): void {
  const blank = (start: number, end: number): void => {
    for (let at = start; at < end; at += 1) {
      if (found.blanked[offset + at] !== '\n') found.blanked[offset + at] = ' ';
    }
  };
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\' && punctuation.test(text[at + 1] ?? '')) {
      at += 1;
      continue;
    }
    if (comments === 'skip' && text.startsWith('<!--', at)) {
      const close = text.indexOf('-->', at + 4);
      const end = close === -1 ? text.length : close + 3;
      blank(at, end);
      at = end - 1;
      continue;
    }
    if (char === '`') {
      const { end, code } = readCode(text, at);
      if (code !== undefined) {
        found.spans.push({ code, line: lineAt(offset + at), link });
        blank(at, end);
      }
      at = end - 1;
      continue;
    }
    if (char !== '[') continue;
    const close = findTextEnd(text, at);
    if (close === -1) continue;
    const inner = text.slice(at + 1, close);
    let destination: string | undefined;
    let end = close + 1;
    if (text[close + 1] === '(') {
      const read = readDestination(text, close + 1);
      if (read !== undefined) ({ destination, end } = read);
    } else {
      const reference = /^\[([^\]]*)\]/u.exec(text.slice(close + 1));
      const label = reference === null || reference[1] === '' ? inner : (reference[1] ?? '');
      destination = definitions.get(foldLabel(label));
      if (reference !== null) end = close + 1 + reference[0].length;
    }
    if (destination === undefined) continue;
    const sole = /^\s*(`+)([^`]+)\1\s*$/u.exec(inner);
    found.links.push({
      destination,
      line: lineAt(offset + at),
      code: sole === null ? undefined : (sole[2] ?? '').trim(),
    });
    readInline(
      inner,
      offset + at + 1,
      lineAt,
      definitions,
      found.links.length - 1,
      found,
      comments,
    );
    at = end - 1;
  }
}

/**
 * What the Markdown `text` holds (see {@link MarkdownReading}), as CommonMark reads it closely
 * enough to judge it: front matter and HTML comments hold nothing, unless `options` reads them
 * as prose; code blocks are read as `readBlocks` says; in a paragraph, a backslash escapes a
 * punctuation character, a code span runs between equal backtick runs, and a link is inline (`[text](destination "title")`), a full or collapsed reference
 * (`[text][label]`, `[label][]`) or a shortcut (`[label]`) to a definition of the text, its
 * label matched case-folded; link text may run over the lines of a paragraph, and an image is
 * read as its link.
 */
export function readMarkdown(text: string, options: MarkdownOptions): MarkdownReading {
  const lines = text.split('\n');
  let first = 0;
  if (options.frontMatter === 'skip' && lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) first = close + 1;
  }
  const definitions = new Map<string, string>();
  const { paragraphs, codeLines } = readBlocks(lines, first, definitions, options.comments);
  const spans: MarkdownSpan[] = [];
  const links: MarkdownLink[] = [];
  const prose: MarkdownLine[] = [];
  for (const paragraph of paragraphs) {
    const joined = paragraph.map(({ text: line }) => line).join('\n');
    const starts: number[] = [];
    let position = 0;
    for (const { text: line } of paragraph) {
      starts.push(position);
      position += line.length + 1;
    }
    const lineAt = (offset: number): number => {
      let index = 0;
      while (index + 1 < starts.length && (starts[index + 1] ?? 0) <= offset) index += 1;
      return paragraph[index]?.line ?? 0;
    };
    const found: Found = { spans, links, blanked: joined.split('') };
    readInline(joined, 0, lineAt, definitions, undefined, found, options.comments);
    for (const [index, line] of found.blanked.join('').split('\n').entries()) {
      prose.push({ text: line, line: paragraph[index]?.line ?? 0 });
    }
  }
  return { spans, links, codeLines, prose };
}

/** Whether `path` names a Markdown file: `.md`, `.markdown` or `.mdx`, in any case. */
export function isMarkdown(path: string): boolean {
  return /\.(?:md|markdown|mdx)$/iu.test(path);
}
