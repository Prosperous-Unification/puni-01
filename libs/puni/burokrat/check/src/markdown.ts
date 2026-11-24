/** One inline code span of Markdown, and whether it stands in the text of a link. */
export interface CodeSpan {
  readonly code: string;
  readonly inLinkText: boolean;
}

/**
 * One link of Markdown, inline or by reference: its destination as written, a `<…>` and a title
 * dropped, and its text's one code span when the text is nothing else.
 */
export interface MarkdownLink {
  readonly destination: string;
  readonly code: string | undefined;
}

/** What the prose of a Markdown text holds: its code spans and its links. */
export interface MarkdownProse {
  readonly spans: readonly CodeSpan[];
  readonly links: readonly MarkdownLink[];
}

/** A reference definition's label as links match it: lower-cased, its spaces collapsed. */
function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/gu, ' ').toLowerCase();
}

const definition = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+.*)?$/u;
const fence = /^ {0,3}(```|~~~)/u;
const listItem = /^\s*(?:[-*+]|\d+[.)])\s/u;

/**
 * The paragraphs of the Markdown `text` that are prose, each its lines joined: not front matter,
 * a fenced or an indented code block, an HTML comment or a reference definition, whose labels
 * go to `definitions`. A line indented four spaces after a blank line is code unless it
 * continues a list.
 */
function listParagraphs(text: string, definitions: Map<string, string>): string[] {
  const lines = text.replace(/<!--[\s\S]*?-->/gu, '').split('\n');
  let at = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) at = close + 1;
  }
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inFence = false;
  let inList = false;
  let blankBefore = true;
  const close = (): void => {
    if (current.length > 0) paragraphs.push(current.join('\n'));
    current = [];
  };
  for (; at < lines.length; at += 1) {
    const line = lines[at] ?? '';
    if (fence.test(line)) {
      inFence = !inFence;
      close();
      continue;
    }
    if (inFence) continue;
    if (line.trim() === '') {
      close();
      blankBefore = true;
      continue;
    }
    const indentedCode = /^( {4}|\t)/u.test(line) && blankBefore && !inList;
    if (indentedCode) {
      close();
      continue;
    }
    if (listItem.test(line)) inList = true;
    else if (!/^\s/u.test(line)) inList = false;
    blankBefore = false;
    const defined = definition.exec(line);
    if (defined !== null) {
      definitions.set(normalizeLabel(defined[1] ?? ''), defined[2] ?? '');
      continue;
    }
    current.push(line);
  }
  close();
  return paragraphs;
}

/** The end of the backtick run at `start` in `text`, and the code span it opens, if it closes. */
function readCode(
  text: string,
  start: number,
): { readonly end: number; readonly code: string | undefined } {
  let run = start;
  while (text[run] === '`') run += 1;
  const ticks = text.slice(start, run);
  const closing = text.indexOf(ticks, run);
  if (closing === -1) return { end: run, code: undefined };
  const raw = text.slice(run, closing).replace(/\n/gu, ' ');
  const code = /^ .*[^ ].* $/u.test(raw) ? raw.slice(1, -1) : raw;
  return { end: closing + ticks.length, code };
}

/** The index of the `]` closing the link text opened at `open`, nested brackets and code skipped. */
function findTextEnd(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\') {
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

/** The prose of one paragraph (see {@link readProse}), from `start` to `end`. */
function readInline(
  text: string,
  definitions: ReadonlyMap<string, string>,
  inLinkText: boolean,
  found: { spans: CodeSpan[]; links: MarkdownLink[] },
): void {
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\') {
      at += 1;
      continue;
    }
    if (char === '`') {
      const { end, code } = readCode(text, at);
      if (code !== undefined) found.spans.push({ code, inLinkText });
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
      destination = definitions.get(normalizeLabel(label));
      if (reference !== null) end = close + 1 + reference[0].length;
    }
    if (destination === undefined) continue;
    const sole = /^\s*(`+)([^`]+)\1\s*$/u.exec(inner);
    found.links.push({
      destination,
      code: sole === null ? undefined : (sole[2] ?? '').trim(),
    });
    readInline(inner, definitions, true, found);
    at = end - 1;
  }
}

/**
 * The prose of the Markdown `text`: every code span, those of link text marked, and every link,
 * inline (`[text](destination "title")`), full or collapsed reference (`[text][label]`,
 * `[label][]`) or shortcut (`[label]`) to a definition the text holds. Front matter, fenced and
 * indented code blocks and HTML comments hold no prose; link text may run over lines of a
 * paragraph, and an image is read as its link.
 */
export function readProse(text: string): MarkdownProse {
  const definitions = new Map<string, string>();
  const paragraphs = listParagraphs(text, definitions);
  const found = { spans: [] as CodeSpan[], links: [] as MarkdownLink[] };
  for (const paragraph of paragraphs) readInline(paragraph, definitions, false, found);
  return found;
}
