/**
 * Each place in the doc comment `text` where the block tag `@<name>` opens, at tag position (the
 * start of a line), with the text after it.
 */
function findTags(text: string, names: readonly string[]): string[] {
  const opener = new RegExp(`^\\s*@(?:${names.join('|')})(?![\\w$])`, 'gmu');
  return [...text.matchAll(opener)].map((match) => text.slice(match.index + match[0].length));
}

/** `text` after a leading `{…}` type, its braces balanced, and the spaces around it. */
function skipType(text: string): string {
  const rest = text.trimStart();
  if (!rest.startsWith('{')) return rest;
  let depth = 0;
  for (let at = 0; at < rest.length; at += 1) {
    if (rest[at] === '{') depth += 1;
    if (rest[at] === '}') depth -= 1;
    if (depth === 0) return rest.slice(at + 1).trimStart();
  }
  return '';
}

const identifier = /^[A-Za-z_$][\w$]*/u;

/**
 * The names the `@typedef` and `@callback` tags of a doc comment's text declare, at tag position,
 * after a type in balanced braces, as `@typedef {{ a: number }} Thing` gives `Thing`.
 */
export function listTypedefs(text: string): string[] {
  return findTags(text, ['typedef', 'callback']).flatMap(
    (rest) => identifier.exec(skipType(rest))?.[0] ?? [],
  );
}

/**
 * The names the `@template` tags of the doc comment `text` declare: `@template T, U`,
 * `@template {C} T` and `@template [T=D]` alike, a constraint in balanced braces.
 */
export function listTemplateNames(text: string): string[] {
  const names: string[] = [];
  for (const tag of findTags(text, ['template'])) {
    let rest = skipType(tag).split('\n')[0] ?? '';
    for (;;) {
      const name = /^\s*\[?([A-Za-z_$][\w$]*)[^,\s]*\s*(,?)/u.exec(rest);
      if (name === null) break;
      names.push(name[1] ?? '');
      if (name[2] === '') break;
      rest = rest.slice(name[0].length);
    }
  }
  return names;
}

/**
 * The names the `@import` tags of the doc comment `text` bind: `@import X from "m"`,
 * `@import { a, b as c } from "m"` and `@import * as ns from "m"`, as a JavaScript file imports
 * types.
 */
export function listImportNames(text: string): string[] {
  return findTags(text, ['import']).flatMap((tag) => {
    const clause = /^([\s\S]*?)\bfrom\s*["']/u.exec(tag)?.[1];
    if (clause === undefined) return [];
    return clause
      .replace(/[{}]/gu, ',')
      .split(',')
      .flatMap((part) => identifier.exec(part.trim().split(/\s+/u).at(-1) ?? '')?.[0] ?? []);
  });
}
