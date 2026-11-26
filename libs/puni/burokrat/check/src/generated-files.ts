import { posix } from 'node:path';
import { type CheckoutFiles, repositoryScope } from '@puni/shared-checkout';

/** One `.gitattributes` file of a checkout: the directory it stands in, and its text. */
export interface AttributesFile {
  readonly directory: string;
  readonly text: string;
}

/** How deep the directory `directory` lies below the root, the root `.` at 0. */
function depthOf(directory: string): number {
  return directory === '.' ? 0 : directory.split('/').length;
}

/** Every visible `.gitattributes` file of `files`, outermost first. */
export function readAttributes(files: CheckoutFiles): AttributesFile[] {
  return files
    .listVisible(repositoryScope)
    .filter((path) => posix.basename(path) === '.gitattributes')
    .map((path) => ({ directory: posix.dirname(path), text: files.readText(path) }))
    .sort((left, right) => depthOf(left.directory) - depthOf(right.directory));
}

/** The characters each POSIX class of a bracket expression stands for, as a JavaScript class holds them. */
const posixClasses: Readonly<Record<string, string>> = {
  alnum: 'A-Za-z0-9',
  alpha: 'A-Za-z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '!-~',
  lower: 'a-z',
  print: ' -~',
  punct: '!-\\/:-@\\[-`{-~',
  space: ' \\t\\n\\v\\f\\r',
  upper: 'A-Z',
  xdigit: '0-9A-Fa-f',
};

/**
 * The bracket expression opening at `open` in `segment` as a JavaScript class, and where it ends;
 * `undefined` when it does not close. A leading `!` or `^` negates it, a `]` first is a
 * character, and `[:name:]` is a POSIX class; it never matches a `/`.
 */
function readBracket(
  segment: string,
  open: number,
): { readonly expression: string; readonly end: number } | undefined {
  let at = open + 1;
  const negated = segment[at] === '!' || segment[at] === '^';
  if (negated) at += 1;
  let inside = '';
  for (let first = true; at < segment.length; first = false) {
    const char = segment[at] ?? '';
    if (char === ']' && !first) {
      return { expression: negated ? `[^/${inside}]` : `[${inside}]`, end: at };
    }
    const named = /^\[:([a-z]+):\]/u.exec(segment.slice(at));
    const posix = named === null ? undefined : posixClasses[named[1] ?? ''];
    if (named !== null && posix !== undefined) {
      inside += posix;
      at += named[0].length;
      continue;
    }
    if (char === '\\' && at + 1 < segment.length) {
      const escaped = segment[at + 1] ?? '';
      inside += /[\\\][^-]/u.test(escaped) ? `\\${escaped}` : escaped;
      at += 2;
      continue;
    }
    inside += /[\\\][^]/u.test(char) ? `\\${char}` : char;
    at += 1;
  }
  return undefined;
}

/**
 * One segment of a pattern, no `/` in it, as an expression: `*` and `?` never cross a `/`;
 * `undefined` for a bracket expression that never closes, which makes git match nothing.
 */
function compileSegment(segment: string): string | undefined {
  let expression = '';
  for (let at = 0; at < segment.length; at += 1) {
    const char = segment[at] ?? '';
    if (char === '*') {
      expression += '[^/]*';
    } else if (char === '?') {
      expression += '[^/]';
    } else if (char === '[') {
      const bracket = readBracket(segment, at);
      if (bracket === undefined) return undefined;
      expression += bracket.expression;
      at = bracket.end;
    } else if (char === '\\' && at + 1 < segment.length) {
      expression += (segment[at + 1] ?? '').replace(/[.+^${}()|[\]\\*?/]/gu, '\\$&');
      at += 1;
    } else {
      expression += char.replace(/[.+^${}()|[\]\\/]/gu, '\\$&');
    }
  }
  return expression;
}

/**
 * The expression a path below its attributes file's directory matches the pattern `pattern` by,
 * as git's wildmatch reads it: a pattern with a `/` but at its end is anchored at the directory,
 * one without matches a name at any depth; a `**` segment matches any directories, the last
 * one anything below; a pattern ending in `/` names a directory, which no file is, and one with
 * an unclosed `[` matches nothing.
 */
function compilePattern(pattern: string): RegExp {
  const anchored = pattern.replace(/\/$/u, '').includes('/');
  const segments = pattern.replace(/^\//u, '').split('/');
  let expression = '';
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    const compiled = segment === '**' ? undefined : compileSegment(segment);
    if (segment === '**') expression += last ? '.*' : '(?:.*/)?';
    else if (compiled === undefined) return /(?!)/u;
    else expression += `${compiled}${last ? '' : '/'}`;
  }
  return new RegExp(anchored ? `^${expression}$` : `(?:^|/)${expression}$`, 'u');
}

/** The state an attribute line gives `linguist-generated` or `linguist-vendored`, if it names one. */
function readSetting(setting: string): { readonly name: string; readonly on: boolean } | undefined {
  const match = /^([-!]?)(linguist-(?:generated|vendored))(?:=(.*))?$/u.exec(setting);
  if (match === null) return undefined;
  const [, prefix, name = '', value] = match;
  return { name, on: prefix === '' && value !== 'false' };
}

/**
 * Whether git attributes the file at `path` as generated or vendored code, as `git check-attr`
 * reads `linguist-generated` and `linguist-vendored` from `attributes`, the checkout's
 * `.gitattributes` files: each file's lines apply to the paths below its directory, a deeper
 * file's after an outer one's and a later line's after an earlier one, the last line naming an
 * attribute deciding it. A pattern without a slash matches a name at any depth, one with a slash
 * the path from the file's directory, `*` and `?` never crossing a `/` and `**` crossing any;
 * a pattern ending in `/` matches no file. `name` and `name=<value>` set an attribute, but for
 * `=false`; `-name` unsets it and `!name` leaves it unspecified.
 */
export function isGeneratedFile(attributes: readonly AttributesFile[], path: string): boolean {
  const state = new Map<string, boolean>();
  for (const { directory, text } of attributes) {
    const below = directory === '.' ? path : path.slice(directory.length + 1);
    if (directory !== '.' && !path.startsWith(`${directory}/`)) continue;
    for (const line of text.split('\n')) {
      const [pattern, ...settings] = line.trim().split(/\s+/u);
      if (pattern === undefined || pattern === '' || pattern.startsWith('#')) continue;
      const named = settings.flatMap((setting) => readSetting(setting) ?? []);
      if (named.length === 0 || !compilePattern(pattern).test(below)) continue;
      for (const { name, on } of named) state.set(name, on);
    }
  }
  return [...state.values()].some((on) => on);
}
