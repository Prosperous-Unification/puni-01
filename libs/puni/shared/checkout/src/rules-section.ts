/**
 * The `## Rules` section of the Markdown `text`: from its `## Rules` heading line to the next
 * `## ` heading or the end, or `undefined` when no line is that heading.
 */
export function readRulesSection(text: string): string | undefined {
  const heading = /^## Rules[ \t]*$/mu.exec(text);
  if (heading === null) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^## /mu.exec(rest);
  return text.slice(
    heading.index,
    heading.index + heading[0].length + (next?.index ?? rest.length),
  );
}
