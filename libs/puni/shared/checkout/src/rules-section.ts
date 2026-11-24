/**
 * The `## Rules` section of the Markdown `text`: from its `## Rules` heading line to the next
 * `## ` heading or the end, or `undefined` when no line is that heading.
 */
export function readRulesSection(text: string): string | undefined {
  const span = findRulesSection(text);
  return span === undefined ? undefined : text.slice(span.start, span.end);
}

/**
 * The Markdown `text` with its `## Rules` section, as {@link readRulesSection} finds it, replaced
 * by `section`, or `undefined` when no line is that heading. The section ends in exactly one
 * blank line when a heading follows it, and in exactly one newline when it ends the file.
 */
export function replaceRulesSection(text: string, section: string): string | undefined {
  const span = findRulesSection(text);
  if (span === undefined) return undefined;
  const after = text.slice(span.end);
  const body = section.replace(/\s+$/u, '');
  return `${text.slice(0, span.start)}${body}${after === '' ? '\n' : `\n\n${after}`}`;
}

function findRulesSection(text: string): { start: number; end: number } | undefined {
  const heading = /^## Rules[ \t]*$/mu.exec(text);
  if (heading === null) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^## /mu.exec(rest);
  return {
    start: heading.index,
    end: heading.index + heading[0].length + (next?.index ?? rest.length),
  };
}
