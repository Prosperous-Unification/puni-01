import { rulesSectionTitle } from './rules-section';
import type { RepositoryType } from './registry';
import recordsAgents from './templates/records-agents.md.tmpl' with { type: 'text' };
import stateAgents from './templates/state-agents.md.tmpl' with { type: 'text' };

/**
 * The `AGENTS.md` each repository type starts with, as a template of the `{{placeholder}}`s
 * `name` and `recordsUrl`. A system-state `AGENTS.md` is its template, a blank line, then the
 * rules section of the checkout that created it, copied whole, so the section ends the file.
 */
export const agentsTemplates: Readonly<Record<RepositoryType, string>> = {
  'system-state': stateAgents,
  'system-records': recordsAgents,
};

/** A Markdown heading of level 1 or 2: its level, its text and its line, counted from 1. */
export interface MarkdownHeading {
  readonly level: 1 | 2;
  readonly text: string;
  readonly line: number;
}

/** An ATX heading of level 1 or 2: up to three spaces, `#` or `##`, its text, closing `#`s. */
const atxHeading = /^ {0,3}(#{1,2})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/u;

/** A setext underline: `=` for level 1 or `-` for level 2, under a paragraph line. */
const setextUnderline = /^ {0,3}(=+|-+)[ \t]*$/u;

/** A line that cannot be the paragraph a setext underline turns into a heading. */
const notParagraph =
  /^(?:\s*$| {4}|\t| {0,3}(?:#|>|[-*+][ \t]|\d+[.)][ \t]|```|~~~|=+[ \t]*$|-+[ \t]*$))/u;

/** A fence opening or closing a code block. */
const fence = /^ {0,3}(`{3,}|~{3,})/u;

/**
 * The line numbers, counted from 0, inside a fenced code block of `lines` that is closed: a fence
 * left open is judged as text, so it cannot hide what follows it.
 */
function listFencedLines(lines: readonly string[]): ReadonlySet<number> {
  const fenced = new Set<number>();
  let opened: { readonly marker: string; readonly at: number } | undefined;
  lines.forEach((line, index) => {
    const marker = fence.exec(line)?.[1];
    if (marker === undefined) return;
    if (opened === undefined) {
      opened = { marker, at: index };
    } else if (marker[0] === opened.marker[0] && marker.length >= opened.marker.length) {
      for (let inside = opened.at; inside <= index; inside += 1) fenced.add(inside);
      opened = undefined;
    }
  });
  return fenced;
}

/**
 * How many lines the front matter opening `lines` takes, its two `---` lines included: 0 when the
 * first line is not `---` or no later line closes it.
 */
function countFrontMatterLines(lines: readonly string[]): number {
  if (lines[0]?.trimEnd() !== '---') return 0;
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---');
  return end < 0 ? 0 : end + 1;
}

/**
 * The headings of level 1 and 2 in the Markdown `text`, in order: ATX (`# `, `## `) and setext
 * (a paragraph line underlined with `=` or `-`), outside closed fenced code blocks and the front
 * matter that opens the text, whose closing `---` underlines no heading.
 */
export function readHeadings(text: string): MarkdownHeading[] {
  const lines = text.split('\n');
  const fenced = listFencedLines(lines);
  const skipped = countFrontMatterLines(lines);
  const headings: MarkdownHeading[] = [];
  lines.forEach((line, index) => {
    if (fenced.has(index) || index < skipped) return;
    const atx = atxHeading.exec(line);
    if (atx !== null) {
      headings.push({
        level: atx[1] === '#' ? 1 : 2,
        text: (atx[2] ?? '').trim(),
        line: index + 1,
      });
      return;
    }
    const underline = setextUnderline.exec(line)?.[1];
    const above = lines[index - 1];
    if (underline === undefined || above === undefined || fenced.has(index - 1)) return;
    if (index - 1 < skipped) return;
    if (notParagraph.test(above)) return;
    headings.push({ level: underline.startsWith('=') ? 1 : 2, text: above.trim(), line: index });
  });
  return headings;
}

/** The texts of the level-2 headings of `template`. */
function listSections(template: string): string[] {
  return readHeadings(template)
    .filter(({ level }) => level === 2)
    .map(({ text }) => text);
}

/**
 * The `## ` sections an `AGENTS.md` of each repository type holds, by their heading text: those
 * its template in {@link agentsTemplates} seeds, and for a system-state repository the rules
 * section `repo init` appends.
 */
export const agentsSections: Readonly<Record<RepositoryType, readonly string[]>> = {
  'system-state': [...listSections(stateAgents), rulesSectionTitle],
  'system-records': listSections(recordsAgents),
};
