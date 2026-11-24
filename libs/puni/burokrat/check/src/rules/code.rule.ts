import type { Rule } from '../finding';

/** Whether the file at `path` is production TypeScript: a `.ts` file that is no test or test host. */
function isProductionCode(path: string): boolean {
  return path.endsWith('.ts') && !/\.test(-host)?\.ts$/u.test(path);
}

/**
 * Whether `text` opens with a header comment: a comment, after any `#!` line, followed by a blank
 * line, an import or nothing. A comment directly on the first declaration is its JSDoc.
 */
export function opensWithHeader(text: string): boolean {
  const lines = text.replace(/^\uFEFF/u, '').split('\n');
  let index = lines[0]?.startsWith('#!') === true ? 1 : 0;
  const first = lines[index]?.trimStart() ?? '';
  if (first.startsWith('//')) {
    while (lines[index]?.trimStart().startsWith('//') === true) index += 1;
  } else if (first.startsWith('/*')) {
    while (index < lines.length && lines[index]?.includes('*/') !== true) index += 1;
    index += 1;
  } else {
    return false;
  }
  const next = lines[index]?.trim() ?? '';
  return next === '' || /^import\b/u.test(next);
}

/**
 * No production `.ts` file the scope owns opens with a header comment (see `opensWithHeader`):
 * what a file holds is said by its names and by JSDoc on its symbols.
 */
export const forbidFileHeaders: Rule = {
  id: 'code.header',
  since: 1,
  remedy: 'delete the header comment; say what a symbol does in JSDoc on it',
  judge({ files, scope }) {
    return files
      .listVisible(scope)
      .filter(isProductionCode)
      .filter((path) => opensWithHeader(files.readText(path)))
      .map((path) => ({ path, message: 'opens with a header comment' }));
  },
};
