/** One `key: value` line of front matter, the value trimmed. */
export interface FrontMatterField {
  readonly key: string;
  readonly value: string;
}

/** Parsed front matter: its fields in file order, or why the text has none it can read. */
export type FrontMatter =
  | { readonly fields: readonly FrontMatterField[] }
  | { readonly problem: 'absent' }
  | { readonly problem: 'malformed'; readonly line: string };

/**
 * Reads front matter that opens `text` between two `---` lines and holds one `key: value` per
 * line. A text that does not open with `---`, or never closes it, has none (`absent`).
 */
export function parseFrontMatter(text: string): FrontMatter {
  const lines = text.split(/\r?\n/u);
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 0) return { problem: 'absent' };
  const fields: FrontMatterField[] = [];
  for (const line of lines.slice(1, end)) {
    const field = /^([A-Za-z][\w-]*):(.*)$/u.exec(line);
    if (field?.[1] === undefined || field[2] === undefined) return { problem: 'malformed', line };
    fields.push({ key: field[1], value: field[2].trim() });
  }
  return { fields };
}
