import { posix } from 'node:path';
import { type CheckoutFiles, repositoryScope } from '@puni/shared-checkout';

/** One `.gitattributes` file of a checkout: the directory it stands in, and its text. */
export interface AttributesFile {
  readonly directory: string;
  readonly text: string;
}

/** Every visible `.gitattributes` file of `files`, outermost first. */
export function readAttributes(files: CheckoutFiles): AttributesFile[] {
  return files
    .listVisible(repositoryScope)
    .filter((path) => posix.basename(path) === '.gitattributes')
    .map((path) => ({ directory: posix.dirname(path), text: files.readText(path) }))
    .sort((left, right) => left.directory.split('/').length - right.directory.split('/').length);
}

/** The expression a path below its attributes file's directory matches the pattern `pattern` by. */
function compilePattern(pattern: string): RegExp | undefined {
  if (pattern.endsWith('/')) return undefined;
  const anchored = pattern.includes('/');
  const body = pattern.replace(/^\//u, '');
  let expression = '';
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at] ?? '';
    if (body.startsWith('**/', at) && (at === 0 || body[at - 1] === '/')) {
      expression += '(?:.*/)?';
      at += 2;
    } else if (body.startsWith('/**', at) && at + 3 === body.length) {
      expression += '/.*';
      at += 2;
    } else if (char === '*') {
      expression += '[^/]*';
    } else if (char === '?') {
      expression += '[^/]';
    } else if (char === '[') {
      const close = body.indexOf(']', at + 2);
      if (close === -1) {
        expression += '\\[';
      } else {
        expression += `[${body
          .slice(at + 1, close)
          .replace(/^!/u, '^')
          .replace(/\\/gu, '\\\\')}]`;
        at = close;
      }
    } else if (char === '\\' && at + 1 < body.length) {
      expression += (body[at + 1] ?? '').replace(/[.+^${}()|[\]\\*?]/gu, '\\$&');
      at += 1;
    } else {
      expression += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    }
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
      if (named.length === 0 || compilePattern(pattern)?.test(below) !== true) continue;
      for (const { name, on } of named) state.set(name, on);
    }
  }
  return [...state.values()].some((on) => on);
}
