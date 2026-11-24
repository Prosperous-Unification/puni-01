/** A `.gitattributes` pattern, as the expression a repository path matches it by. */
function compilePattern(pattern: string): RegExp {
  const body = pattern
    .replace(/^\//u, '')
    .replace(/\/$/u, '/**')
    .split('')
    .map((char, at, chars) => {
      if (char === '*' && chars[at + 1] === '*') return '\u0000';
      if (char === '*') return chars[at - 1] === '*' ? '' : '[^/]*';
      if (char === '?') return '[^/]';
      return char.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    })
    .join('')
    .replaceAll('\u0000/', '(?:.*/)?')
    .replaceAll('\u0000', '.*');
  return pattern.replace(/\/$/u, '').includes('/')
    ? new RegExp(`^${body}$`, 'u')
    : new RegExp(`(?:^|/)${body}$`, 'u');
}

/**
 * Whether git attributes the file at `path` as generated or vendored code, by the
 * `.gitattributes` text `attributes`: the last line whose pattern matches it sets or unsets
 * `linguist-generated` or `linguist-vendored` (`-name` and `name=false` unset it). A pattern
 * without a `/` matches a name in any directory; one ending in `/` a directory and all below it.
 */
export function isGeneratedFile(attributes: string, path: string): boolean {
  let generated = false;
  for (const line of attributes.split('\n')) {
    const [pattern, ...settings] = line.trim().split(/\s+/u);
    if (pattern === undefined || pattern === '' || pattern.startsWith('#')) continue;
    for (const setting of settings) {
      const match = /^(-)?linguist-(?:generated|vendored)(?:=(\w+))?$/u.exec(setting);
      if (match === null || !compilePattern(pattern).test(path)) continue;
      generated = match[1] === undefined && match[2] !== 'false';
    }
  }
  return generated;
}
