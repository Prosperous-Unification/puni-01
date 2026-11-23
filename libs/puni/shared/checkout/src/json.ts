/** Whether a parsed JSON `value` is an object: not `null`, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A JSON `value` as a validation message shows it: `missing` when absent, else its JSON. */
export function describeValue(value: unknown): string {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

/** What parsing a JSON text gave: its value, or the problem, `is not valid JSON: …`, and its cause. */
export type ParsedJson =
  { readonly value: unknown } | { readonly problem: string; readonly cause: SyntaxError };

/** `text` parsed as JSON; invalid JSON is the problem, any other failure propagates. */
export function parseJson(text: string): ParsedJson {
  try {
    return { value: JSON.parse(text) };
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return { problem: `is not valid JSON: ${cause.message}`, cause };
  }
}

/**
 * Calls `refuse` naming every key of the JSON object `value` outside `keys`, `where` naming the
 * object (the empty string for a document's top level), when there is one.
 */
export function requireOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  where: string,
  refuse: (problem: string) => never,
): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    const subject = where === '' ? '' : `${where} `;
    refuse(`${subject}has unknown keys ${unknown.join(', ')}; it holds only ${keys.join(', ')}`);
  }
}
