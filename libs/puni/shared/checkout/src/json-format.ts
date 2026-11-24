/** The line width {@link formatJson} fits arrays within: this repository's formatter's. */
const printWidth = 100;

const indentUnit = '  ';

/** Whether `value` holds a non-empty object at any depth, which always takes its own lines. */
function holdsObject(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsObject);
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

function printInline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(printInline).join(', ')}]`;
  return JSON.stringify(value);
}

/**
 * `value` printed at `indent`, its line already holding `lead` characters and followed by
 * `trail` more.
 */
function print(value: unknown, indent: string, lead: number, trail: number): string {
  const inner = `${indent}${indentUnit}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inline = printInline(value);
    if (!holdsObject(value) && lead + inline.length + trail <= printWidth) return inline;
    const lines = value.map(
      (element, index) =>
        `${inner}${print(element, inner, inner.length, index < value.length - 1 ? 1 : 0)}`,
    );
    return `[\n${lines.join(',\n')}\n${indent}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([key, element], index) => {
      const head = `${inner}${JSON.stringify(key)}: `;
      return `${head}${print(element, inner, head.length, index < entries.length - 1 ? 1 : 0)}`;
    });
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * `value` as JSON with a final newline, laid out as this repository's formatter (`bun fmt`)
 * leaves it: every non-empty object on its own lines, indented by two spaces; an array on one
 * line when it holds no non-empty object and fits within 100 columns, else one element per line.
 * A long array of numbers, which the formatter fills several to a line, is the one layout it
 * does not match.
 */
export function formatJson(value: unknown): string {
  return `${print(value, '', 0, 0)}\n`;
}
