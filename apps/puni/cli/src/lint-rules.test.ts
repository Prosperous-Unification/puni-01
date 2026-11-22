import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const root = new URL('../../../../', import.meta.url).pathname;

/** The repository's ESLint configuration, without the type-checked rules a virtual file cannot feed. */
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
});

/** The ids of every rule `source` breaks as the file at `path`, Nx boundaries left aside. */
async function lintRules(path: string, source: string): Promise<string[]> {
  const [report] = await eslint.lintText(`${source}\n`, { filePath: join(root, path) });
  return (report?.messages ?? [])
    .map((entry) => entry.ruleId ?? `unused directive: ${entry.message}`)
    .filter((rule) => rule !== '@nx/enforce-module-boundaries');
}

const check = 'libs/puni/burokrat/check/src';
const longFile = Array.from(
  { length: 401 },
  (_line, index) => `export const a${String(index)} = 1;`,
);

const refused: readonly (readonly [string, string, string, string])[] = [
  ['a production file over 400 lines', `${check}/x.ts`, longFile.join('\n'), 'max-lines'],
  ['a variable named data', `${check}/x.ts`, 'export const data = 1;', 'id-denylist'],
  [
    'a parameter named item',
    `${check}/x.test.ts`,
    'export const f = (item: number) => item;',
    'id-denylist',
  ],
  [
    'a disable directive without a description',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger\ndebugger;',
    '@eslint-community/eslint-comments/require-description',
  ],
  [
    'a disable directive that disables nothing',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger -- nothing here stops\nexport const a = 1;',
    "unused directive: Unused eslint-disable directive (no problems were reported from 'no-debugger').",
  ],
  [
    'a @param naming no parameter',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param b the other\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/check-param-names',
  ],
  [
    'an unknown tag',
    `${check}/x.ts`,
    '/** @frobnicate */\nexport const a = 1;',
    'jsdoc/check-tag-names',
  ],
  [
    'a JSDoc type in TypeScript',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param {number} a the number\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/no-types',
  ],
  [
    'a @param without a description',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param a\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/require-param-description',
  ],
  [
    'a @returns without a description',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @returns\n */\nexport function f(): number {\n  return 1;\n}',
    'jsdoc/require-returns-description',
  ],
  [
    'an empty tag with content',
    `${check}/x.ts`,
    '/** @internal yes */\nexport const a = 1;',
    'jsdoc/empty-tags',
  ],
  [
    'a rule reading Date.now',
    `${check}/x.rule.ts`,
    'export const a = Date.now();',
    'no-restricted-properties',
  ],
  [
    'a feature constructing the current date',
    `${check}/x.feature.ts`,
    'export const a = new Date();',
    'no-restricted-syntax',
  ],
  [
    'a resource reading performance.now',
    `${check}/x.resource.ts`,
    'export const a = performance.now();',
    'no-restricted-properties',
  ],
  [
    'domain reading Bun.nanoseconds',
    `${check}/x.ts`,
    'export const a = Bun.nanoseconds();',
    'no-restricted-properties',
  ],
  [
    'a test using toThrow',
    `${check}/x.test.ts`,
    'expect(() => 1).toThrow();',
    'no-restricted-syntax',
  ],
  [
    'a test using toThrowError',
    `${check}/x.test.ts`,
    'expect(() => 1).toThrowError();',
    'no-restricted-syntax',
  ],
];

const allowed: readonly (readonly [string, string, string])[] = [
  ['a test over 400 lines', `${check}/x.test.ts`, longFile.join('\n')],
  ['domain constructing a given date', `${check}/x.ts`, 'export const a = new Date(0);'],
  ['a command reading the clock', `${check}/x.command.ts`, 'export const a = new Date();'],
  [
    'a repository reading the clock',
    'libs/puni/shared/adapters/src/x.repository.ts',
    'export const a = Date.now();',
  ],
  [
    'a described disable directive that disables a problem',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger -- the probe stops here\ndebugger;',
  ],
];

describe('the repository lint rules', () => {
  test.each(refused)('%s is refused', async (_name, path, source, rule) => {
    expect(await lintRules(path, source)).toContain(rule);
  });

  test.each(allowed)('%s is allowed', async (_name, path, source) => {
    expect(await lintRules(path, source)).toEqual([]);
  });
});
